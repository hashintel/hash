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
 * - The host's `finishBrowserCall` commits the result, then rings the
 *   doorbell. Pi Durable 1.4.0 wakes a sleeping or waiting task early only by
 *   an abort, so ringing is `abortTask(doorbell)`; the doorbell's only
 *   meaning is "wake my owner".
 * - `BrowserCall` resumes, reads the record and ends with the result, which
 *   the tool returns to the model.
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
  type Harness,
  type JsonObject,
  type TaskId,
} from "@earendil-works/pi-durable";
import { obj, str } from "@earendil-works/pi-schema";

import {
  browserToolFacts,
  type CANONICAL_PETRINAUT_TOOL_NAMES,
  type ClientToolResult,
} from "@hashintel/brunch-agent";

/** Long enough that walking away is not a failure; the doorbell ends an unanswered call then. */
export const callTtlMs = 24 * 60 * 60_000;

/** Brunch's model-facing errors for a call that ends without a result. */
export const browserCallUnstartedError =
  "Browser call was not started; no document operation was invoked.";

export type BrowserCallStatus =
  /** Issued; no browser has claimed it. */
  | "pending"
  /** A browser holds the capability and may be running it. */
  | "claimed"
  /** The browser's result is committed; the doorbell is rung. */
  | "finished"
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
  claimed: boolean;
  output: JsonValue;
  metadata: JsonValue;
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
  | { status: "expired"; claimed: boolean };

type BrowserCallState = { phase: "arm" } | { phase: "collect" };

/** The model-facing error for a call that ended without a result, as Brunch words it. */
export const unfinishedError = (record: BrowserCallRecord, cause: string) => {
  if (!record.claimed) return browserCallUnstartedError;
  return browserToolFacts(record.toolName).effectUnknownOnFailure
    ? `Browser call ${cause}; an attempted document effect is unknown.`
    : `Browser call ${cause}; the document is unchanged.`;
};

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
        // Claimed and finished before this phase ran: nothing to wait for.
        if (record.status === "finished")
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

/** A canonical Petrinaut net mutation, so its `documentRevision` is `"change"`. */
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

/** `setNetTitle` as the browser runs it, the tool call waiting for the browser's result. */
export const setNetTitleTool = defineTool({
  ...setNetTitleDefinition,
  replay: "safe",
  execute: async (args, api, context) => {
    const { conversationId, callId } = api;
    const taskId = await api.commit(async (tx) => {
      const { calls } = await tx.doc(BrowserCallsDoc, conversationId);
      const issued = calls[callId];
      if (issued !== undefined)
        return issued.task as TaskId<BrowserCallOutcome>;
      const task = await tx.createTask(
        BrowserCall,
        { conversationId, toolCallId: callId },
        { ownership: { kind: "task", taskId: api.taskId } },
      );
      const issuedAt = api.now();
      calls[callId] = {
        toolCallId: callId,
        toolName: browserToolName,
        input: args,
        status: "pending",
        issuedAt,
        expiresAt: issuedAt + callTtlMs,
        task,
        doorbell: null,
        capability: null,
        claimed: false,
        output: null,
        metadata: null,
      };
      return task;
    }, context);
    const { state } = await api.waitForTask(taskId, context);
    const { outcome } = state;
    if (outcome.status !== "completed")
      throw new Error(`Browser call task ended ${outcome.status}.`);
    if (outcome.result.status === "expired") {
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
    // The model sees the browser's output; its metadata stays on the record.
    return {
      output: [{ type: "text", text: JSON.stringify(outcome.result.output) }],
    };
  },
});

export const browserCallExtension = defineExtension({
  name: "brunch-browser-call",
  tools: [setNetTitleTool],
  tasks: [BrowserCall, Doorbell],
});

/**
 * Claim an issued, unclaimed call: the browser half of Brunch's
 * `claimBrowserCall`. Returns the one-use capability the result must carry.
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

/** A browser's result for a call it claimed, as Brunch's panel posts it. */
export type BrowserCallResult = ClientToolResult & {
  readonly conversationId: ConversationId;
  readonly capability: string;
  readonly canonicalInput: JsonObject;
};

/** Whether `result` carries the capability, tool and input of the claim on `record`. */
export const carriesClaim = (
  record: BrowserCallRecord | undefined,
  result: BrowserCallResult,
): record is BrowserCallRecord =>
  record !== undefined &&
  record.capability === result.capability &&
  record.toolName === result.toolName &&
  JSON.stringify(record.input) === JSON.stringify(result.canonicalInput);

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
  // Before `arm` ran there is no doorbell yet, and `arm` finds the call finished.
  if (doorbell !== null) await harness.abortTask(doorbell as TaskId, context);
  return "settled";
};
