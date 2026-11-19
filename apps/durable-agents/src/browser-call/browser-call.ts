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

import { copyJson, type JsonValue } from "@earendil-works/chord/json";
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
  type ToolExecutionApi,
  type ToolRegistration,
  type ToolTaskInput,
  type Tx,
} from "@earendil-works/pi-durable";
import { obj, str } from "@earendil-works/pi-schema";

import {
  type BrowserCallClaim,
  browserCallEndedWithoutResult,
  type BrowserCallFailureDisposition,
  browserCallStaleRefusal,
  browserCallUnstartedRefusal,
  type BrowserContext,
  type BrowserToolEnvelope,
  browserToolFacts,
  type CANONICAL_PETRINAUT_TOOL_NAMES,
  canonicalContent,
  type ClientToolResult,
  mayShowNet,
} from "@hashintel/brunch-agent";

import { netFreshnessAtIssue } from "../net-state/net-freshness";
import { renderBrowserResult } from "../net-state/visible-net-view";
import { checkpointEvery } from "../shared/checkpoint-when";

import type { HostBinding } from "../agent/host-binding";
import type { Context } from "@earendil-works/chord/context";

/** Long enough that walking away is not a failure; the doorbell ends an unanswered call then. */
export const callTtlMs = 24 * 60 * 60_000;

/**
 * The output bound of a tool that may show the net (H10): the largest example
 * net's read-back and definition exceed Pi's default 50 KiB. A result still
 * cut is not a view, so the earlier view stays.
 */
export const netToolOutputLimits = { maxBytes: 256 * 1024 } as const;

/**
 * The output bound of a tool whose result is text rendered for the model, the
 * HASH graph reads (HA-5): the net tools' 256 KiB, with the line limit raised
 * to match, so a whole page of short lines is cut by bytes, not at Pi's
 * default 2,000 lines. A safety net only: such a tool never shows the net,
 * cut or not.
 */
export const textToolOutputLimits = {
  maxBytes: netToolOutputLimits.maxBytes,
  maxLines: netToolOutputLimits.maxBytes,
} as const;

/** The output bound a browser tool gets, by its facts; Pi's default for any other. */
const outputLimitsOf = (toolName: string) => {
  if (mayShowNet(toolName)) return netToolOutputLimits;
  if (browserToolFacts(toolName).textResult) return textToolOutputLimits;
  return undefined;
};

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
  /** The task delivered the failure to the tool. */
  | "failure-settled"
  /**
   * The browser's outcome was committed, but its turn was aborted before the
   * task delivered it. Keeps the outcome: `output` and `metadata`, or `failure`.
   */
  | "discarded"
  /** No result before `expiresAt`. */
  | "expired"
  /** The call was aborted, or its wait ended before `expiresAt` without an outcome. */
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
  issuedEntry?: EntryId;
  /**
   * The call's index among `issuedEntry`'s tool calls. A waiting call's
   * result reaches the model right after `issuedEntry`, at this index (Pi
   * Durable orders a round's results by call), so the pair is both the
   * call's issue position and its delivery position.
   */
  callIndex?: number;
  /** Why a `failed` call ended without a result. */
  failure?: BrowserCallFailureDisposition;
  /**
   * The tool task that owns the call and its restart count when the
   * browser's outcome (`finished` or `failed`) was committed: restarts while
   * it waited, which the host's crash-loop guard does not charge. Absent
   * before an outcome, and on calls answered before it was recorded.
   */
  ownerAtOutcome?: { task: TaskId; restarts: number };
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
  // Latest history: each base deletes the revisions before it.
  checkpointWhen: checkpointEvery({ changes: 32 }),
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
  | { status: "stopped"; claimed: boolean }
  | { status: "failed"; disposition: BrowserCallFailureDisposition };

type BrowserCallState = { phase: "arm" } | { phase: "collect" };

/** Whether a browser may have run the call: it started, or held a single-shot claim. */
const mayHaveStarted = (record: BrowserCallRecord) =>
  record.started ?? record.claimed;

/** The model-facing error for a call that expired or stopped without a result. */
export const unfinishedError = (
  record: BrowserCallRecord,
  cause: "expired" | "stopped",
) =>
  mayHaveStarted(record)
    ? browserCallEndedWithoutResult(
        cause,
        !browserToolFacts(record.toolName).effectUnknownOnFailure,
      )
    : browserCallUnstartedRefusal;

/** The model-facing error for a call the browser failed, as Brunch's `outcomeError` words it. */
const failureError = (
  toolName: string,
  disposition: BrowserCallFailureDisposition,
) => {
  if (disposition === "stale") return browserCallStaleRefusal;
  if (disposition === "unstarted") return browserCallUnstartedRefusal;
  return browserCallEndedWithoutResult(
    "failed",
    !browserToolFacts(toolName).effectUnknownOnFailure,
  );
};

// The lifecycle's categories that more than one reader asks. A new status
// is placed in each of them here; the commits below also match single
// statuses, for transitions and retry receipts.

/** No outcome yet: issued, or held by a browser. */
export const isAwaitingBrowser = (record: BrowserCallRecord) =>
  record.status === "pending" || record.status === "claimed";

/** The browser's outcome is committed and the task has not delivered it yet. */
export const isAnsweredUncollected = (record: BrowserCallRecord) =>
  record.status === "finished" || record.status === "failed";

/** Whether a browser may still claim, start, renew or answer the call at `now`. */
export const isAdmittable = (record: BrowserCallRecord, now: number) =>
  isAwaitingBrowser(record) && now < record.expiresAt;

/**
 * Whether an outcome may still reach the call's turn, so aborting the turn
 * would discard it: a browser holds the call before it expires, or its
 * outcome is committed and not yet delivered.
 */
export const isHeld = (record: BrowserCallRecord, now: number) =>
  (record.status === "claimed" && now < record.expiresAt) ||
  isAnsweredUncollected(record);

/** The browser committed a result, whether or not its turn received it. */
export const hasCommittedResult = (record: BrowserCallRecord) =>
  record.status === "settled" ||
  (record.status === "discarded" && record.failure === undefined);

/** The browser committed a failure, whether or not its turn received it. */
export const hasCommittedFailure = (record: BrowserCallRecord) =>
  record.status === "failure-settled" ||
  (record.status === "discarded" && record.failure !== undefined);

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
        if (isAnsweredUncollected(record))
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
        // Keep the capability on answered calls solely to authenticate result receipts.
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
        if (record.status === "failed") {
          record.status = "failure-settled";
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
        }
        // No outcome: the doorbell expired, or ended early without a ring.
        const cause = runtime.now() < record.expiresAt ? "stopped" : "expired";
        record.status = cause;
        record.capability = null;
        return {
          status: "terminal",
          outcome: {
            status: "completed",
            result: { status: cause, claimed: record.claimed },
          },
        };
      }, context),
  },
  abort: (task, runtime, context) =>
    runtime.commit(async (tx) => {
      const record = (await tx.doc(BrowserCallsDoc, task.input.conversationId))
        .calls[task.input.toolCallId];
      if (record !== undefined && isAwaitingBrowser(record)) {
        record.status = "stopped";
        record.capability = null;
      } else if (record !== undefined && isAnsweredUncollected(record)) {
        // The capability stays, as on a delivered outcome, for retried receipts.
        record.status = "discarded";
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
): Promise<{ issuedEntry: EntryId; callIndex: number } | undefined> => {
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

/**
 * Net freshness for a model-issued call: the view in the context that ends at
 * the call's assistant entry. A nested call has no such entry.
 */
const freshnessAtIssue = async (
  host: HostBinding,
  api: Pick<
    ToolExecutionApi,
    "conversationId" | "taskId" | "callId" | "getTask"
  >,
  context: Context,
  noViewRefusal: string | undefined,
) => {
  const input = (await api.getTask(api.taskId, context))?.input as
    | ToolTaskInput
    | undefined;
  if (input?.kind !== "model")
    throw new Error(
      `Conversation history does not contain browser call ${api.callId}.`,
    );
  return netFreshnessAtIssue(
    host,
    api.conversationId,
    input.assistant,
    context,
    noViewRefusal,
  );
};

/**
 * How a catalogue adapts the waiting tool to its own inputs and results. Each
 * is optional; without them the model's arguments are issued as they are and
 * the browser's output is what the model sees.
 */
export type BrowserToolAdapters<TInput> = {
  /**
   * Parses the model's arguments with the tool's own schema, before anything
   * else; a throw is an error result whose text is its message, with nothing
   * recorded. The parsed input is what is issued and recorded. Pi checks the
   * arguments against the JSON Schema only, which can't carry every
   * refinement, and the browser parses the issued input with the tool's own
   * schema.
   */
  readonly parseInput?: (args: unknown) => TInput;
  /** Why a parsed input is refused before it is issued, if it is; checked before net freshness. */
  readonly refuse?: (input: TInput) => string | undefined;
  /**
   * What the model and the UI are shown of a settled result, in place of the
   * browser's output; a throw (an output in an unknown shape) is an error
   * result whose text is its message. The record keeps the browser's output.
   */
  readonly present?: (output: JsonValue, input: TInput) => JsonValue;
  /**
   * Appended to every error of a call the browser may have started: a
   * failure with its effect unknown, an expiry after a start, and a result
   * `present` could not read. Never to a refusal or a call that never started.
   */
  readonly mayHaveRunNote?: string;
};

export type WaitingBrowserToolOptions<TInput = JsonObject> =
  BrowserToolAdapters<TInput> &
    (
      | {
          /**
           * A document change is refused without a current view of the net
           * (`net-freshness.ts`), and otherwise issued against the revision of that
           * view, read through `host` from the context the model had at the call.
           */
          readonly host: HostBinding;
          /** The refusal for a change with no view; the website's `noNetViewRefusal` by default. */
          readonly noViewRefusal?: string;
        }
      /**
       * Only test scaffolding: the proofs and probes call `setNetTitle` alone,
       * with no net read before it.
       */
      | { readonly checksNetView: false }
    );

const errorResult = (text: string) => ({
  output: [{ type: "text" as const, text }],
  isError: true,
});

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * A tool the bound browser runs, the tool call waiting for the browser's
 * result: the call is recorded `pending` in `BrowserCallsDoc` with the
 * conversation's binding, a `BrowserCall` task waits for its outcome, and the
 * browser's output becomes the tool's result. Its tasks are registered by
 * `browserCallExtension`, which must be installed wherever it runs.
 *
 * Before the commit that would issue it, a call's input is parsed
 * (`parseInput`), then checked (`refuse`), and a document change is checked
 * for a current view of the net: refused at any of them, it records nothing
 * and returns the refusal as an error result. Each decides the same on a
 * rerun, and an issued call's record wins, so a rerun keeps its first
 * decision.
 *
 * A settled result reaches the model as `present` shows it: a text-result
 * tool's string as itself, anything else rendered (`renderBrowserResult`), a
 * read with its `netRevision`, a change with `netAfterChanges` and
 * `netRevision`. A tool that may show the net gets `netToolOutputLimits`, a
 * text-result tool `textToolOutputLimits`.
 */
export const defineWaitingBrowserTool = <
  TParameters extends object,
  TInput = JsonObject,
>(
  definition: BrowserToolDefinition<TParameters>,
  options: WaitingBrowserToolOptions<TInput>,
): ToolRegistration<TParameters> => {
  const facts = browserToolFacts(definition.name);
  const outputLimits = outputLimitsOf(definition.name);
  /** An error of a call the browser may have started, with the note when there is one. */
  const mayHaveRunError = (text: string) =>
    errorResult(
      options.mayHaveRunNote === undefined
        ? text
        : `${text} ${options.mayHaveRunNote}`,
    );
  return defineTool<TParameters>({
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters,
    replay: "safe",
    ...(outputLimits === undefined ? {} : { outputLimits }),
    execute: async (args, api, context) => {
      const { conversationId, callId } = api;
      let input: TInput;
      try {
        input =
          options.parseInput === undefined
            ? (args as TInput)
            : options.parseInput(args);
      } catch (error) {
        return errorResult(messageOf(error));
      }
      const refusal = options.refuse?.(input);
      if (refusal !== undefined) return errorResult(refusal);
      const freshness =
        "host" in options &&
        facts.requiresFreshView &&
        (await api.snapshot(BrowserCallsDoc, conversationId, context))?.calls[
          callId
        ] === undefined
          ? await freshnessAtIssue(
              options.host,
              api,
              context,
              options.noViewRefusal,
            )
          : undefined;
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
          if (freshness !== undefined && "refusal" in freshness)
            return { refusal: freshness.refusal };
          const expectedRevision = freshness?.revision;
          const position = await issuePosition(tx, api.taskId, callId);
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
            // The parsed input is JSON: it parses the model's JSON arguments.
            input: copyJson(input as JsonObject) as JsonObject,
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
      if ("refusal" in issued) return errorResult(issued.refusal);
      const { state } = await api.waitForTask(issued.task, context);
      const { outcome } = state;
      if (outcome.status !== "completed")
        throw new Error(`Browser call task ended ${outcome.status}.`);
      const { result } = outcome;
      if (result.status === "failed") {
        const text = failureError(definition.name, result.disposition);
        return result.disposition === "failed"
          ? mayHaveRunError(text)
          : errorResult(text);
      }
      if (result.status === "expired" || result.status === "stopped") {
        const record = (await api.snapshot(
          BrowserCallsDoc,
          conversationId,
          context,
        ))!.calls[callId]!;
        const text = unfinishedError(record, result.status);
        return mayHaveStarted(record)
          ? mayHaveRunError(text)
          : errorResult(text);
      }
      let presented: JsonValue;
      try {
        presented =
          options.present === undefined
            ? result.output
            : options.present(result.output, input);
      } catch (error) {
        return mayHaveRunError(messageOf(error));
      }
      // The model sees the presented output: a text result's string as itself, anything else rendered with what it shows of the net. The UI's details carry Brunch's envelope with the presented output and the metadata.
      return {
        output: [
          {
            type: "text",
            text:
              facts.textResult && typeof presented === "string"
                ? presented
                : renderBrowserResult(
                    definition.name,
                    presented,
                    result.metadata,
                  ),
          },
        ],
        details: {
          brunchBrowserResult: true,
          output: presented,
          ...(result.metadata === null ? {} : { metadata: result.metadata }),
        } satisfies BrowserToolEnvelope,
      };
    },
  });
};

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

// The sweep cannot put its read of the calls in Pi's abort transaction. Keep
// claim and outcome commits and that check/abort decision in order on this
// fenced Harness.
const claimDecisions = new WeakMap<Harness, Promise<unknown>>();
export const withBrowserClaimDecision = <Result>(
  harness: Harness,
  decide: () => Promise<Result>,
) => {
  const previous = claimDecisions.get(harness) ?? Promise.resolve();
  const decision = previous.catch(() => {}).then(decide);
  claimDecisions.set(harness, decision);
  const release = () => {
    if (claimDecisions.get(harness) === decision)
      claimDecisions.delete(harness);
  };
  void decision.then(release, release);
  return decision;
};

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
  now = Date.now,
) =>
  withBrowserClaimDecision(harness, () =>
    harness.commit(async (tx) => {
      const record = (await tx.doc(BrowserCallsDoc, conversationId)).calls[
        toolCallId
      ];
      if (record?.status !== "pending" || !isAdmittable(record, now()))
        return undefined;
      record.status = "claimed";
      record.claimed = true;
      record.capability = randomBytes(32).toString("base64url");
      // Copies: the draft is unusable once the commit settles.
      return {
        capability: record.capability,
        toolName: record.toolName,
        input: copyJson(record.input) as JsonObject,
      };
    }, context),
  );

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
  now = Date.now,
) =>
  withBrowserClaimDecision(harness, () =>
    harness.commit(async (tx): Promise<BrowserCallClaimOutcome> => {
      const record = (await tx.doc(BrowserCallsDoc, conversationId)).calls[
        toolCallId
      ];
      if (record === undefined) return { status: "not-issued" };
      if (record.binding === undefined || record.binding === null)
        return { status: "wrong-binding" };
      if (record.binding !== binding) return { status: "wrong-binding" };
      if (!isAdmittable(record, now())) return { status: "ended" };
      if (record.status === "claimed") {
        // A single-shot claim (`started` absent) has no start step: it counts as started.
        if (record.started !== false) return { status: "started" };
        if (record.claimant === claimant && record.capability !== null)
          return {
            status: "claimed",
            claim: claimOf(record, record.capability),
          };
      }
      record.status = "claimed";
      record.claimed = true;
      record.started = false;
      record.claimant = claimant;
      record.capability = randomBytes(32).toString("base64url");
      return { status: "claimed", claim: claimOf(record, record.capability) };
    }, context),
  );

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
  now = Date.now,
) =>
  harness.commit(async (tx): Promise<"started" | "refused"> => {
    const record = (await tx.doc(BrowserCallsDoc, conversationId)).calls[
      toolCallId
    ];
    if (!heldCall(record, proof) || !isAdmittable(record, now()))
      return "refused";
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
  now = Date.now,
) => {
  const record = (
    await harness.snapshot(BrowserCallsDoc, conversationId, context)
  )?.calls[toolCallId];
  return heldCall(record, proof) && isAdmittable(record, now());
};

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

/**
 * The tool task that owns `record`'s call and its restart count, read in the
 * commit of the call's outcome so that no restart falls between them.
 */
const ownerAtOutcome = async (
  tx: Tx,
  record: BrowserCallRecord,
): Promise<BrowserCallRecord["ownerAtOutcome"]> => {
  const owner = (await tx.task(record.task as TaskId))?.owner;
  if (owner === undefined) return undefined;
  return { task: owner, restarts: (await tx.task(owner))?.restarts ?? 0 };
};

/** Ring a call's doorbell, if `arm` has created one; before then `arm` finds the call answered. */
const ring = async (harness: Harness, doorbell: TaskId, context: Context) => {
  const task = await harness.getTask(doorbell, context);
  if (
    task !== undefined &&
    task.state.status !== "terminal" &&
    !task.abortRequested
  )
    await harness.abortTask(doorbell, context);
};

/** Commit only the wake, never run the browser effect or replace its outcome. */
export const recoverBrowserCallWakes = async (
  harness: Harness,
  conversationId: ConversationId,
  context: Context,
) => {
  const calls =
    (await harness.snapshot(BrowserCallsDoc, conversationId, context))?.calls ??
    {};
  await Promise.all(
    Object.values(calls).flatMap((record) =>
      isAnsweredUncollected(record) && record.doorbell !== null
        ? [ring(harness, record.doorbell as TaskId, context)]
        : [],
    ),
  );
};

/**
 * Return the committed receipt even if the wake fails. Every failure here has
 * failed the Session (Pi exempts only reads, and `ring` reads nothing that
 * can throw a `StorageRequestError`), so the next owner's
 * `recoverBrowserCallWakes` rings again.
 */
const ringAfterCommit = async (
  harness: Harness,
  doorbell: number | null,
  context: Context,
) => {
  if (doorbell === null) return;
  await ring(harness, doorbell as TaskId, context).catch(() => {});
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
  now = Date.now,
): Promise<"settled" | "not-issued"> => {
  const doorbell = await withBrowserClaimDecision(harness, () =>
    harness.commit(async (tx) => {
      const record = (await tx.doc(BrowserCallsDoc, result.conversationId))
        .calls[result.toolCallId];
      if (!carriesClaim(record, result)) return undefined;
      if (hasCommittedResult(record)) return null;
      if (record.status === "claimed" && isAdmittable(record, now())) {
        record.status = "finished";
        record.output = (result.output ?? null) as JsonValue;
        record.metadata = (result.metadata ?? null) as JsonValue;
        const owner = await ownerAtOutcome(tx, record);
        if (owner !== undefined) record.ownerAtOutcome = owner;
      }
      return record.status === "finished" ? record.doorbell : undefined;
    }, context),
  );
  if (doorbell === undefined) return "not-issued";
  await ringAfterCommit(harness, doorbell, context);
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
  now = Date.now,
): Promise<"failed" | "not-issued"> => {
  const doorbell = await withBrowserClaimDecision(harness, () =>
    harness.commit(async (tx) => {
      const record = (await tx.doc(BrowserCallsDoc, failure.conversationId))
        .calls[failure.toolCallId];
      if (!carriesClaim(record, failure)) return undefined;
      if (hasCommittedFailure(record)) return null;
      if (record.status === "claimed" && isAdmittable(record, now())) {
        record.status = "failed";
        record.failure =
          record.started === true && failure.disposition !== "failed"
            ? "failed"
            : failure.disposition;
        const owner = await ownerAtOutcome(tx, record);
        if (owner !== undefined) record.ownerAtOutcome = owner;
      }
      return record.status === "failed" ? record.doorbell : undefined;
    }, context),
  );
  if (doorbell === undefined) return "not-issued";
  await ringAfterCommit(harness, doorbell, context);
  return "failed";
};
