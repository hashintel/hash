/**
 * Probe: the browser call as an asynchronous tool (the "start, then deliver
 * the result as a new message" loop), against `browser-call.ts`, where the
 * tool call waits for the browser.
 *
 * - The tool's issue commit records the call `pending` and creates its
 *   `BrowserCallExpiry` task, once per tool call ID, then returns at once:
 *   the model is told the call started, and the run can end.
 * - The host's `finishAsyncBrowserCall` commits the browser's result to the
 *   record and admits it as input to the conversation in the same commit
 *   (`Conversation.submit(tx, ...)`, Pi Durable 1.5.0), as a
 *   `brunch.browser-result` entry the model sees as a user message.
 * - `BrowserCallExpiry` is a background task that sleeps until the call
 *   expires; if no result came by then, it admits the expiry the same way.
 *
 * No tool invocation waits for the browser, so nothing holds the Harness
 * awake while the call is pending.
 */
import { type Context, copyJson, type JsonValue } from "@earendil-works/chord";
import {
  type Conversation,
  type ConversationId,
  defineExtension,
  defineTask,
  defineTool,
  type Harness,
  type InputSubmissionDraft,
  type SubmissionId,
  type TaskId,
} from "@earendil-works/pi-durable";

import {
  type BrowserCallRecord,
  type BrowserCallResult,
  BrowserCallsDoc,
  callTtlMs,
  carriesClaim,
  setNetTitleDefinition,
  unfinishedError,
} from "./browser-call";

/** The entry kind a browser call's late result or expiry is placed as. */
export const browserResultEntryKind = "brunch.browser-result";

/** What the model is told when the call starts. */
export const browserCallStartedText = (callId: string) =>
  `Browser call ${callId} started. The panel's result arrives as a later message; do not wait for it in this turn.`;

/** The input a call's result or expiry is admitted as. */
const resultInput = (
  record: BrowserCallRecord,
  status: "settled" | "expired",
  text: string,
): InputSubmissionDraft => ({
  type: "input",
  content: text,
  whenBusy: "followUp",
  entry: {
    kind: browserResultEntryKind,
    data: {
      toolCallId: record.toolCallId,
      toolName: record.toolName,
      status,
      output: status === "settled" ? copyJson(record.output) : null,
    },
  },
});

type ExpiryState = { phase: "sleep" } | { phase: "expire" };

/** Sleeps until the call expires; then, if no result came, delivers the expiry. */
const BrowserCallExpiry = defineTask<
  { conversationId: ConversationId; toolCallId: string; until: number },
  ExpiryState,
  "expired" | "answered"
>({
  name: "brunch.browser-call.expiry",
  version: 1,
  initial: () => ({ phase: "sleep" }),
  phases: {
    sleep: (task, runtime, context) =>
      runtime.sleepUntil(task.input.until, { phase: "expire" }, context),
    expire: async (task, runtime, context) => {
      const conversation = await runtime.conversation(
        task.input.conversationId,
        context,
      );
      if (conversation === undefined)
        throw new Error("Browser call conversation is gone.");
      return runtime.commit(async (tx) => {
        const record = (
          await tx.doc(BrowserCallsDoc, task.input.conversationId)
        ).calls[task.input.toolCallId];
        if (
          record === undefined ||
          (record.status !== "pending" && record.status !== "claimed")
        )
          return {
            status: "terminal",
            outcome: { status: "completed", result: "answered" },
          };
        await conversation.submit(
          tx,
          resultInput(
            record,
            "expired",
            `Browser call ${record.toolCallId} (${record.toolName}): ${unfinishedError(record, "expired")}`,
          ),
        );
        record.status = "expired";
        record.capability = null;
        return {
          status: "terminal",
          outcome: { status: "completed", result: "expired" },
        };
      }, context);
    },
  },
  abort: (_task, runtime, context) =>
    runtime.commit(
      () => ({ status: "terminal", outcome: { status: "aborted" } }),
      context,
    ),
});

/** `setNetTitle` as an asynchronous tool: it issues the call and returns. */
export const setNetTitleAsyncTool = defineTool({
  ...setNetTitleDefinition,
  // A rerun after a crash finds the record and returns the same start.
  replay: "safe",
  execute: async (args, api, context) => {
    const { conversationId, callId } = api;
    await api.commit(async (tx) => {
      const { calls } = await tx.doc(BrowserCallsDoc, conversationId);
      if (calls[callId] !== undefined) return;
      const issuedAt = api.now();
      const expiresAt = issuedAt + callTtlMs;
      const task = await tx.createTask(
        BrowserCallExpiry,
        { conversationId, toolCallId: callId, until: expiresAt },
        {
          ownership: { kind: "conversation" },
          conversationId,
          background: true,
        },
      );
      calls[callId] = {
        toolCallId: callId,
        toolName: setNetTitleDefinition.name,
        input: args,
        status: "pending",
        issuedAt,
        expiresAt,
        task,
        doorbell: null,
        capability: null,
        claimed: false,
        output: null,
        metadata: null,
      };
    }, context);
    return { output: [{ type: "text", text: browserCallStartedText(callId) }] };
  },
});

export const asyncBrowserCallExtension = defineExtension({
  name: "brunch-browser-call",
  tools: [setNetTitleAsyncTool],
  tasks: [BrowserCallExpiry],
});

/**
 * Commit a claimed call's result and admit it to the conversation, in one
 * commit: the record is `settled` exactly when the result is queued for the
 * model. Then end the expiry task. A retry after a crash finds the call
 * settled and admits nothing again.
 */
export const finishAsyncBrowserCall = async (
  harness: Harness,
  result: BrowserCallResult,
  context: Context,
): Promise<
  | { status: "settled"; submissionId: SubmissionId | undefined }
  | { status: "not-issued" }
> => {
  const conversation: Conversation | undefined = await harness.conversation(
    result.conversationId,
    context,
  );
  if (conversation === undefined) return { status: "not-issued" };
  const settled = await conversation.commit(async (tx) => {
    const record = (await tx.doc(BrowserCallsDoc, result.conversationId)).calls[
      result.toolCallId
    ];
    if (!carriesClaim(record, result)) return undefined;
    if (record.status === "settled")
      return { submissionId: undefined, expiry: record.task };
    if (record.status !== "claimed") return undefined;
    record.output = (result.output ?? null) as JsonValue;
    record.metadata = (result.metadata ?? null) as JsonValue;
    const submissionId = await conversation.submit(
      tx,
      resultInput(
        record,
        "settled",
        `Browser result for ${record.toolName} call ${record.toolCallId}: ${JSON.stringify(record.output)}`,
      ),
    );
    record.status = "settled";
    record.capability = null;
    return { submissionId, expiry: record.task };
  }, context);
  if (settled === undefined) return { status: "not-issued" };
  await harness.abortTask(settled.expiry as TaskId, context);
  return { status: "settled", submissionId: settled.submissionId };
};
