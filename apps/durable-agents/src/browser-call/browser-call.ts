/**
 * A browser (human-in-the-loop) tool call as durable state, in the shape of
 * Brunch's process-local rendezvous
 * (`apps/brunch-agent/src/shared/conversation/browser-call-rendezvous.ts`):
 * the agent issues a call, a browser claims it and finishes it with a result.
 * Here every step is a commit, so an issued call survives a process kill and
 * an absence of any length short of its expiry.
 *
 * - The tool's issue commit records the call `pending` and creates the
 *   `BrowserCall` task that owns it, once per tool call ID: a replay-safe
 *   rerun after a restart finds the record and waits on the same task.
 * - `BrowserCall` creates a `Doorbell` child that sleeps until the call
 *   expires, and waits on it, holding no invocation.
 * - The host's `finishBrowserCall` (or `failBrowserCall`) commits the outcome,
 *   then rings the doorbell. Pi Durable 1.4.0 wakes a sleeping or waiting task
 *   early only by an abort, so ringing is `abortTask(doorbell)`; the
 *   doorbell's only meaning is "wake my owner".
 * - `BrowserCall` resumes, reads the record and ends with the outcome, which
 *   the tool returns to the model.
 *
 * Claiming has two forms. `claimBrowserCall` is the original single-shot
 * claim the proofs use. `claimBrowserCallAs` is the owner's claim rule: a
 * claim names its claimant (one per tab) and the tab's editor binding, is
 * idempotent per claimant, and moves to another claimant only until the
 * holder calls `startBrowserCall`, immediately before it executes the call.
 *
 * The tool task itself holds an invocation while it waits: a built-in
 * `pi.tool` task cannot end its phase waiting. It is replay-safe so a restart
 * reruns it instead of answering `interrupted`.
 */
import { randomBytes } from "node:crypto";

import { type Context, copyJson, type JsonValue } from "@earendil-works/chord";
import {
  type ConversationId,
  defineDoc,
  defineExtension,
  defineTask,
  defineTool,
  type EntryId,
  type Harness,
  type JsonObject,
  type TaskId,
  type ToolRegistration,
  type ToolTaskInput,
  type Tx,
} from "@earendil-works/pi-durable";
import { obj, str } from "@earendil-works/pi-schema";

import {
  type BrowserCallClaim,
  type BrowserCallFailureDisposition,
  type BrowserContext,
  type BrowserToolEnvelope,
  browserToolFacts,
  type CANONICAL_PETRINAUT_TOOL_NAMES,
  canonicalContent,
  type ClientToolResult,
} from "@hashintel/brunch-agent";

import { expectedNetRevision, viewedCalls } from "../net-state/net-freshness";

/** Long enough that walking away is not a failure; the doorbell ends an unanswered call then. */
export const callTtlMs = 24 * 60 * 60_000;

/** Brunch's model-facing errors for a call that ends without a result. */
export const browserCallUnstartedError =
  "Browser call was not started; no document operation was invoked.";

/** Copied from `apps/brunch-agent/src/shared/conversation/browser-call-rendezvous.ts`. */
export const browserCallStaleError =
  "Not started: the document changed by other means after your last view of the net. Read the net again, then make the change.";

export type BrowserCallStatus =
  /** Issued; no browser has claimed it. */
  | "pending"
  /** A browser holds the capability and may be running it. */
  | "claimed"
  /** The browser's result is committed; the doorbell is rung. */
  | "finished"
  /** The browser reported the call ended without a result; the doorbell is rung. */
  | "failed"
  /** The task delivered the result to the tool. */
  | "settled"
  /** No result before `expiresAt`. */
  | "expired"
  /** The call was aborted, for example by a conversation abort. */
  | "stopped";

export type BrowserCallRecord = {
  toolCallId: string;
  toolName: string;
  input: JsonObject;
  status: BrowserCallStatus;
  /** Harness clock. */
  issuedAt: number;
  expiresAt: number;
  task: number;
  doorbell: number | null;
  capability: string | null;
  /** Whether a browser has held the capability. */
  claimed: boolean;
  output: JsonValue;
  metadata: JsonValue;
  /**
   * The conversation's canonical editor binding when the call was issued
   * (`BrowserBindingDoc`); `claimBrowserCallAs` requires a claim to match it.
   * Absent on calls issued before the claim rule, `null` when unbound.
   */
  binding?: string | null;
  /** Who holds the capability, under `claimBrowserCallAs`. */
  claimant?: string;
  /**
   * Whether the holder said it is executing the call (`startBrowserCall`).
   * Absent under the single-shot `claimBrowserCall`, whose claim counts as a start.
   */
  started?: boolean;
  /**
   * The document revision the model last saw, which the browser re-checks
   * before running: net freshness records it on every document change.
   */
  expectedRevision?: string;
  /**
   * The `pi.assistant` entry whose response issued the call. Absent on calls
   * issued before it was recorded, and on a nested call, which no entry holds.
   */
  issuedEntry?: number;
  /**
   * The call's index among `issuedEntry`'s tool calls. A waiting call's
   * result reaches the model right after `issuedEntry`, at this index (Pi
   * Durable orders a round's results by call), so the pair is both the
   * call's issue position and its delivery position.
   */
  callIndex?: number;
  /** Why a `failed` call ended without a result. */
  failure?: BrowserCallFailureDisposition;
};

/** Every browser call of a conversation, by tool call ID: what a panel claims from. */
export const BrowserCallsDoc = defineDoc<{
  calls: Record<string, BrowserCallRecord>;
}>({
  kind: "brunch.browser-calls",
  version: 1,
  scope: "conversation",
  history: "latest",
  // A fork does not inherit calls its parent issued; its tool calls are not running.
  fork: "initial",
  initial: () => ({ calls: {} }),
  checkpointWhen: () => false,
});

/**
 * The editor binding a conversation's browser calls are issued to, as
 * `canonicalContent` of Brunch's `BrowserContext["binding"]`. The server
 * writes it when it creates the conversation (`bindBrowserDocument`).
 */
export const BrowserBindingDoc = defineDoc<{ binding: string | null }>({
  kind: "brunch.browser-binding",
  version: 1,
  scope: "conversation",
  history: "latest",
  // A fork edits the same document.
  fork: "current",
  initial: () => ({ binding: null }),
  checkpointWhen: () => false,
});

/** Bind `conversationId`'s browser calls to the editor `binding` names, in the caller's commit. */
export const bindBrowserDocument = async (
  tx: Tx,
  conversationId: ConversationId,
  binding: BrowserContext["binding"],
) => {
  const document = await tx.doc(BrowserBindingDoc, conversationId);
  document.binding = canonicalContent(binding);
};

type DoorbellState = { phase: "sleep" } | { phase: "expire" };

/** Sleeps until `until`; an abort is the host ringing it. */
const Doorbell = defineTask<{ until: number }, DoorbellState, "expired">({
  name: "brunch.browser-call.doorbell",
  version: 1,
  initial: () => ({ phase: "sleep" }),
  phases: {
    sleep: (task, runtime, context) =>
      runtime.sleepUntil(task.input.until, { phase: "expire" }, context),
    expire: (_task, runtime, context) =>
      runtime.commit(
        () => ({
          status: "terminal",
          outcome: { status: "completed", result: "expired" },
        }),
        context,
      ),
  },
  abort: (_task, runtime, context) =>
    runtime.commit(
      () => ({
        status: "terminal",
        outcome: { status: "aborted", reason: "rung" },
      }),
      context,
    ),
});

export type BrowserCallOutcome =
  | { status: "settled"; output: JsonValue; metadata: JsonValue }
  | { status: "expired"; claimed: boolean }
  | { status: "failed"; disposition: BrowserCallFailureDisposition };

type BrowserCallState = { phase: "arm" } | { phase: "collect" };

/** Whether a browser may have run the call: it started, or held a single-shot claim. */
const mayHaveStarted = (record: BrowserCallRecord) =>
  record.started ?? record.claimed;

/** The model-facing error for a call that ended without a result, as Brunch words it. */
export const unfinishedError = (record: BrowserCallRecord, cause: string) => {
  if (!mayHaveStarted(record)) return browserCallUnstartedError;
  return browserToolFacts(record.toolName).effectUnknownOnFailure
    ? `Browser call ${cause}; an attempted document effect is unknown.`
    : `Browser call ${cause}; the document is unchanged.`;
};

/** The model-facing error for a call the browser failed, as Brunch's `outcomeError` words it. */
const failureError = (
  toolName: string,
  disposition: BrowserCallFailureDisposition,
) => {
  if (disposition === "stale") return browserCallStaleError;
  if (disposition === "unstarted") return browserCallUnstartedError;
  return browserToolFacts(toolName).effectUnknownOnFailure
    ? "The browser result failed; an attempted document effect is unknown."
    : "The non-mutating browser call failed; the document is unchanged.";
};

/** Whether the browser's outcome is committed and the doorbell rung (or due). */
const answered = (record: BrowserCallRecord) =>
  record.status === "finished" || record.status === "failed";

const BrowserCall = defineTask<
  { conversationId: ConversationId; toolCallId: string },
  BrowserCallState,
  BrowserCallOutcome
>({
  name: "brunch.browser-call",
  version: 1,
  initial: () => ({ phase: "arm" }),
  phases: {
    arm: (task, runtime, context) =>
      runtime.commit(async (tx) => {
        const record = (
          await tx.doc(BrowserCallsDoc, task.input.conversationId)
        ).calls[task.input.toolCallId];
        if (record === undefined) throw new Error("Browser call not issued.");
        // Answered before this phase ran: nothing to wait for.
        if (answered(record))
          return { status: "running", checkpoint: { phase: "collect" } };
        const doorbell = await tx.createTask(
          Doorbell,
          { until: record.expiresAt },
          { ownership: { kind: "task", taskId: task.id } },
        );
        record.doorbell = doorbell;
        return {
          status: "waiting",
          on: [doorbell],
          policy: "allSettled",
          checkpoint: { phase: "collect" },
        };
      }, context),
    collect: (task, runtime, context) =>
      runtime.commit(async (tx) => {
        const record = (
          await tx.doc(BrowserCallsDoc, task.input.conversationId)
        ).calls[task.input.toolCallId];
        if (record === undefined) throw new Error("Browser call not issued.");
        record.capability = null;
        if (record.status === "finished") {
          record.status = "settled";
          return {
            status: "terminal",
            outcome: {
              status: "completed",
              result: {
                status: "settled",
                output: copyJson(record.output),
                metadata: copyJson(record.metadata),
              },
            },
          };
        }
        if (record.status === "failed")
          return {
            status: "terminal",
            outcome: {
              status: "completed",
              result: {
                status: "failed",
                disposition: record.failure ?? "failed",
              },
            },
          };
        record.status = "expired";
        return {
          status: "terminal",
          outcome: {
            status: "completed",
            result: { status: "expired", claimed: record.claimed },
          },
        };
      }, context),
  },
  abort: (task, runtime, context) =>
    runtime.commit(async (tx) => {
      const record = (await tx.doc(BrowserCallsDoc, task.input.conversationId))
        .calls[task.input.toolCallId];
      if (record !== undefined) {
        record.status = "stopped";
        record.capability = null;
      }
      return { status: "terminal", outcome: { status: "aborted" } };
    }, context),
});

/** The model-facing face of a browser tool: Pi's tool fields without `execute`. */
export type BrowserToolDefinition<TParameters extends object> = {
  readonly name: string;
  readonly description: string;
  /** JSON Schema of the tool's input, which the Harness validates the model's arguments against. */
  readonly parameters: TParameters;
};

/** Where a model-issued call sits: its assistant entry and its index among that entry's tool calls. */
const issuePosition = async (
  tx: Tx,
  taskId: TaskId,
  callId: string,
): Promise<{ issuedEntry: number; callIndex: number } | undefined> => {
  const input = (await tx.task(taskId))?.input as ToolTaskInput | undefined;
  if (input?.kind !== "model") return undefined;
  const calls = ((await tx.entry(input.assistant))?.model ?? []).flatMap(
    (message) =>
      message.role === "assistant"
        ? message.content.flatMap((content) =>
            content.type === "toolCall" ? [content.id] : [],
          )
        : [],
  );
  const callIndex = calls.indexOf(callId);
  return callIndex === -1
    ? undefined
    : { issuedEntry: input.assistant, callIndex };
};

export type WaitingBrowserToolOptions = {
  /**
   * Whether a document change is refused without a current view of the net
   * (`net-freshness.ts`), and otherwise issued against the revision of that
   * view. Default `true`. Only test scaffolding turns it off: the proofs and
   * probes call `setNetTitle` alone, with no net read before it.
   */
  readonly checksNetView?: boolean;
};

/**
 * A tool the bound browser runs, the tool call waiting for the browser's
 * result: the call is recorded `pending` in `BrowserCallsDoc` with the
 * conversation's binding, a `BrowserCall` task waits for its outcome, and the
 * browser's output becomes the tool's result. Its tasks are registered by
 * `browserCallExtension`, which must be installed wherever it runs.
 *
 * A document change is first checked for a current view of the net, in the
 * same commit that would issue it: refused, it records nothing and returns
 * Brunch's refusal as an error result.
 */
export const defineWaitingBrowserTool = <TParameters extends object>(
  definition: BrowserToolDefinition<TParameters>,
  { checksNetView = true }: WaitingBrowserToolOptions = {},
): ToolRegistration<TParameters> =>
  defineTool<TParameters>({
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters,
    replay: "safe",
    execute: async (args, api, context) => {
      const { conversationId, callId } = api;
      const issued = await api.commit(
        async (
          tx,
        ): Promise<
          | { readonly task: TaskId<BrowserCallOutcome> }
          | { readonly refusal: string }
        > => {
          const { calls } = await tx.doc(BrowserCallsDoc, conversationId);
          const existing = calls[callId];
          if (existing !== undefined)
            return { task: existing.task as TaskId<BrowserCallOutcome> };
          const position = await issuePosition(tx, api.taskId, callId);
          let expectedRevision: string | undefined;
          if (
            checksNetView &&
            browserToolFacts(definition.name).requiresFreshView
          ) {
            if (position === undefined)
              throw new Error(
                `Conversation history does not contain browser call ${callId}.`,
              );
            const expected = expectedNetRevision(
              await viewedCalls(
                tx,
                conversationId,
                position.issuedEntry as EntryId,
              ),
              calls,
            );
            if ("refusal" in expected) return { refusal: expected.refusal };
            expectedRevision = expected.revision;
          }
          const { binding } = await tx.doc(BrowserBindingDoc, conversationId);
          const task = await tx.createTask(
            BrowserCall,
            { conversationId, toolCallId: callId },
            { ownership: { kind: "task", taskId: api.taskId } },
          );
          const issuedAt = api.now();
          calls[callId] = {
            toolCallId: callId,
            toolName: definition.name,
            input: copyJson(args as JsonObject) as JsonObject,
            status: "pending",
            issuedAt,
            expiresAt: issuedAt + callTtlMs,
            task,
            doorbell: null,
            capability: null,
            claimed: false,
            output: null,
            metadata: null,
            binding,
            ...position,
            ...(expectedRevision === undefined ? {} : { expectedRevision }),
          };
          return { task };
        },
        context,
      );
      if ("refusal" in issued)
        return {
          output: [{ type: "text", text: issued.refusal }],
          isError: true,
        };
      const { state } = await api.waitForTask(issued.task, context);
      const { outcome } = state;
      if (outcome.status !== "completed")
        throw new Error(`Browser call task ended ${outcome.status}.`);
      const { result } = outcome;
      if (result.status === "failed")
        return {
          output: [
            {
              type: "text",
              text: failureError(definition.name, result.disposition),
            },
          ],
          isError: true,
        };
      if (result.status === "expired") {
        const record = (await api.snapshot(
          BrowserCallsDoc,
          conversationId,
          context,
        ))!.calls[callId]!;
        return {
          output: [{ type: "text", text: unfinishedError(record, "expired") }],
          isError: true,
        };
      }
      // The model sees the browser's output; the UI's details carry Brunch's envelope with its metadata.
      return {
        output: [{ type: "text", text: JSON.stringify(result.output) }],
        details: {
          brunchBrowserResult: true,
          output: result.output,
          ...(result.metadata === null ? {} : { metadata: result.metadata }),
        } satisfies BrowserToolEnvelope,
      };
    },
  });

/** A canonical Petrinaut net mutation, so `browserToolFacts` counts it as a change. */
export const browserToolName =
  "setNetTitle" satisfies (typeof CANONICAL_PETRINAUT_TOOL_NAMES)[number];

/** `setNetTitle`'s model-facing definition: schema and wording from `@hashintel/petrinaut-core/ai`. */
export const setNetTitleDefinition = {
  name: browserToolName,
  description:
    "Set the human-readable title shown for the current Petrinaut net.",
  parameters: obj({
    title: str({
      minLength: 1,
      maxLength: 120,
      description:
        "Short human-readable title for the net (sentence case, no quotes, ideally under ~60 characters).",
    }),
  }),
};

/** `setNetTitle` as the browser runs it, the tool call waiting for the browser's result; scaffolding, so it skips net freshness. */
export const setNetTitleTool = defineWaitingBrowserTool(setNetTitleDefinition, {
  checksNetView: false,
});

/** The browser-call tasks, and `setNetTitle` for the proofs and probes that call it alone. */
export const browserCallExtension = defineExtension({
  name: "brunch-browser-call",
  tools: [setNetTitleTool],
  tasks: [BrowserCall, Doorbell],
});

/** The issued record, copied out of a draft as the claim the browser receives. */
const claimOf = (record: BrowserCallRecord, capability: string) => ({
  capability,
  toolName: record.toolName,
  input: copyJson(record.input),
  binding: record.binding ?? "",
  ...(record.expectedRevision === undefined
    ? {}
    : { expectedRevision: record.expectedRevision }),
});

/**
 * Claim an issued, unclaimed call: the browser half of Brunch's
 * `claimBrowserCall`. Returns the one-use capability the result must carry.
 * Single-shot: a second claim gets nothing, and the claim counts as a start.
 */
export const claimBrowserCall = (
  harness: Harness,
  conversationId: ConversationId,
  toolCallId: string,
  context: Context,
) =>
  harness.commit(async (tx) => {
    const record = (await tx.doc(BrowserCallsDoc, conversationId)).calls[
      toolCallId
    ];
    if (record?.status !== "pending") return undefined;
    record.status = "claimed";
    record.claimed = true;
    record.capability = randomBytes(32).toString("base64url");
    // Copies: the draft is unusable once the commit settles.
    return {
      capability: record.capability,
      toolName: record.toolName,
      input: copyJson(record.input) as JsonObject,
    };
  }, context);

/** Who claims a call: one ID per browser tab, and the tab's canonical editor binding. */
export type BrowserCallClaimant = {
  readonly claimant: string;
  readonly binding: string;
};

export type BrowserCallClaimOutcome =
  /** The claimant holds the capability; a retry by it returns the same one. */
  | { readonly status: "claimed"; readonly claim: BrowserCallClaim }
  /** No such call (yet): the stream may have delivered it before the issue commit was visible. */
  | { readonly status: "not-issued" }
  /** The claim's binding is not the one the call was issued to, or the conversation is unbound. */
  | { readonly status: "wrong-binding" }
  /** Another claimant started it, or it was claimed single-shot: never re-claimable. */
  | { readonly status: "started" }
  /** It has an outcome, expired or was stopped. */
  | { readonly status: "ended" };

/**
 * Claim a call under the owner's claim rule: the claim names its claimant
 * and proves the tab's editor binding. A retried claim by the same claimant
 * returns the same capability, so a lost response does not strand the call.
 * Another claimant takes the call, with a fresh capability, only while it
 * has not started.
 */
export const claimBrowserCallAs = (
  harness: Harness,
  conversationId: ConversationId,
  toolCallId: string,
  { claimant, binding }: BrowserCallClaimant,
  context: Context,
) =>
  harness.commit(async (tx): Promise<BrowserCallClaimOutcome> => {
    const record = (await tx.doc(BrowserCallsDoc, conversationId)).calls[
      toolCallId
    ];
    if (record === undefined) return { status: "not-issued" };
    if (record.binding === undefined || record.binding === null)
      return { status: "wrong-binding" };
    if (record.binding !== binding) return { status: "wrong-binding" };
    if (record.status !== "pending" && record.status !== "claimed")
      return { status: "ended" };
    if (record.status === "claimed") {
      // A single-shot claim (`started` absent) has no start step: it counts as started.
      if (record.started !== false) return { status: "started" };
      if (record.claimant === claimant && record.capability !== null)
        return { status: "claimed", claim: claimOf(record, record.capability) };
    }
    record.status = "claimed";
    record.claimed = true;
    record.started = false;
    record.claimant = claimant;
    record.capability = randomBytes(32).toString("base64url");
    return { status: "claimed", claim: claimOf(record, record.capability) };
  }, context);

/** What proves a request comes from the claim's holder: Brunch's lease body. */
export type BrowserCallProof = {
  readonly capability: string;
  readonly binding: string;
};

/** The claimed call `proof` holds, if it holds one. */
const heldCall = (
  record: BrowserCallRecord | undefined,
  proof: BrowserCallProof,
): record is BrowserCallRecord =>
  record?.status === "claimed" &&
  record.capability === proof.capability &&
  (record.binding ?? undefined) === proof.binding;

/**
 * The holder says it is about to execute the call. Idempotent; after it the
 * call is never re-claimable. Refused unless `proof` holds the claim.
 */
export const startBrowserCall = (
  harness: Harness,
  conversationId: ConversationId,
  toolCallId: string,
  proof: BrowserCallProof,
  context: Context,
) =>
  harness.commit(async (tx): Promise<"started" | "refused"> => {
    const record = (await tx.doc(BrowserCallsDoc, conversationId)).calls[
      toolCallId
    ];
    if (!heldCall(record, proof)) return "refused";
    record.started = true;
    return "started";
  }, context);

/**
 * The holder is still working on the call. A call's expiry is the doorbell's
 * (`callTtlMs`), not a lease, so this only confirms the claim still holds.
 */
export const renewBrowserCall = async (
  harness: Harness,
  conversationId: ConversationId,
  toolCallId: string,
  proof: BrowserCallProof,
  context: Context,
) =>
  heldCall(
    (await harness.snapshot(BrowserCallsDoc, conversationId, context))?.calls[
      toolCallId
    ],
    proof,
  );

/** A browser's result for a call it claimed, as Brunch's panel posts it. */
export type BrowserCallResult = ClientToolResult & {
  readonly conversationId: ConversationId;
  readonly capability: string;
  readonly canonicalInput: JsonObject;
  /** The claim's binding; checked when given. */
  readonly binding?: string;
};

/** Whether `result` carries the capability, tool and input of the claim on `record`. */
export const carriesClaim = (
  record: BrowserCallRecord | undefined,
  result: Omit<BrowserCallResult, "output">,
): record is BrowserCallRecord =>
  record !== undefined &&
  record.capability === result.capability &&
  record.toolName === result.toolName &&
  (result.binding === undefined ||
    (record.binding ?? undefined) === result.binding) &&
  JSON.stringify(record.input) === JSON.stringify(result.canonicalInput);

/** Ring a call's doorbell, if `arm` has created one; before then `arm` finds the call answered. */
const ring = async (
  harness: Harness,
  doorbell: number | null,
  context: Context,
) => {
  if (doorbell !== null) await harness.abortTask(doorbell as TaskId, context);
};

/**
 * Commit a claimed call's result and wake its task: Brunch's
 * `settleBrowserCall`. A retry with the same capability after a crash
 * between the commit and the ring rings again.
 */
export const finishBrowserCall = async (
  harness: Harness,
  result: BrowserCallResult,
  context: Context,
): Promise<"settled" | "not-issued"> => {
  const doorbell = await harness.commit(async (tx) => {
    const record = (await tx.doc(BrowserCallsDoc, result.conversationId)).calls[
      result.toolCallId
    ];
    if (!carriesClaim(record, result)) return undefined;
    if (record.status === "claimed") {
      record.status = "finished";
      record.output = (result.output ?? null) as JsonValue;
      record.metadata = (result.metadata ?? null) as JsonValue;
    }
    return record.status === "finished" ? record.doorbell : undefined;
  }, context);
  if (doorbell === undefined) return "not-issued";
  await ring(harness, doorbell, context);
  return "settled";
};

/** A browser's report that a claimed call ended without a result, as Brunch's panel posts it. */
export type BrowserCallFailure = Omit<
  BrowserCallResult,
  "output" | "metadata"
> & {
  readonly disposition: BrowserCallFailureDisposition;
};

/**
 * Commit that a claimed call ended without a result and wake its task:
 * Brunch's `failBrowserCall`. A started call cannot be reported unstarted or
 * stale; it fails with its effect unknown. A retry rings again.
 */
export const failBrowserCall = async (
  harness: Harness,
  failure: BrowserCallFailure,
  context: Context,
): Promise<"failed" | "not-issued"> => {
  const doorbell = await harness.commit(async (tx) => {
    const record = (await tx.doc(BrowserCallsDoc, failure.conversationId))
      .calls[failure.toolCallId];
    if (!carriesClaim(record, failure)) return undefined;
    if (record.status === "claimed") {
      record.status = "failed";
      record.failure =
        record.started === true && failure.disposition !== "failed"
          ? "failed"
          : failure.disposition;
    }
    return record.status === "failed" ? record.doorbell : undefined;
  }, context);
  if (doorbell === undefined) return "not-issued";
  await ring(harness, doorbell, context);
  return "failed";
};
