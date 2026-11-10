/**
 * Brunch's model-only context projection
 * (`apps/brunch-agent/src/shared/context-projection.ts`) as a generation
 * `beforeRequest` hook. The model sees:
 *
 * - the net's structure after a change (`netAfterChanges`) only on the latest
 *   change no later net read supersedes; earlier read-backs stay host-only;
 * - each user body as it would read without submission context.
 *
 * Brunch parsed its browser envelope out of the result text. Here a browser
 * tool's result is its output only, so a call's metadata comes from the
 * conversation's browser-call record, by tool call ID. Committed history is
 * unchanged; the projection applies to one request.
 */
import {
  defineExtension,
  GenerationTask,
  hook,
  type HookApi,
} from "@earendil-works/pi-durable";

import {
  browserExecutedToolNames,
  browserToolMutatesDocument,
  isNetObservationTool,
  type NetStructure,
  parseClientToolResultMetadata,
  parsePetrinautUserMessageBody,
  petrinautContextualUserMessageBody,
} from "@hashintel/brunch-agent";

import { BrowserCallsDoc } from "../../browser-call/browser-call";

import type { Context, JsonValue } from "@earendil-works/chord";
import type { Message } from "@earendil-works/pi-ai";

/** What the projection reads of a browser call: the browser's output and Brunch's host metadata. */
export type BrowserCallResult = {
  readonly output: JsonValue;
  readonly metadata: JsonValue;
};

/** A conversation's browser-call results, by tool call ID. */
export type BrowserCallResults = (
  toolCallId: string,
) => BrowserCallResult | undefined;

/**
 * The one read of the browser-call records: the conversation's
 * `BrowserCallsDoc`, as committed when the request is prepared.
 */
export const browserCallResultsOf = async (
  api: Pick<HookApi, "snapshot" | "conversationId">,
  context: Context,
): Promise<BrowserCallResults> => {
  const calls =
    (await api.snapshot(BrowserCallsDoc, api.conversationId, context))?.calls ??
    {};
  return (toolCallId) => {
    const record = calls[toolCallId];
    return record === undefined
      ? undefined
      : { output: record.output, metadata: record.metadata };
  };
};

type NetResultView =
  | { readonly kind: "read" }
  | { readonly kind: "change"; readonly readBack: NetStructure };

/**
 * What a successful browser result shows of the net: a read shows it; a
 * change shows it only when it carries the read-back. Copied from
 * `apps/brunch-agent/src/shared/conversation/net-view.ts`, less the
 * revisions this rule does not read.
 */
const netResultView = (
  toolName: string,
  metadata: unknown,
): NetResultView | undefined => {
  if (!browserExecutedToolNames.has(toolName)) return undefined;
  if (isNetObservationTool(toolName)) return { kind: "read" };
  if (!browserToolMutatesDocument(toolName)) return undefined;
  const parsed = parseClientToolResultMetadata(metadata);
  return parsed?.documentRevision.after === undefined ||
    parsed.readBack === undefined
    ? undefined
    : { kind: "change", readBack: parsed.readBack };
};

/** A successful browser result's view of the net, from its record. */
const viewOf = (message: Message, results: BrowserCallResults) => {
  if (message.role !== "toolResult" || message.isError) return undefined;
  const result = results(message.toolCallId);
  return result === undefined
    ? undefined
    : netResultView(message.toolName, result.metadata);
};

/**
 * The latest change carrying the browser's read-back, unless a later net read
 * already shows the model the net.
 */
const readBackIndex = (
  messages: readonly Message[],
  results: BrowserCallResults,
) => {
  let candidate: number | undefined;
  for (const [index, message] of messages.entries()) {
    const view = viewOf(message, results);
    if (view?.kind === "read") candidate = undefined;
    else if (view?.kind === "change") candidate = index;
  }
  return candidate;
};

/**
 * Submission context is host data the agent reads from the delivery and
 * restates in its instructions. The model sees the body the turn would have
 * had without it: the user's text, or the diagnostics envelope.
 */
const withoutSubmissionContext = (text: string): string => {
  const body = parsePetrinautUserMessageBody(text);
  if (body.kind !== "contextual" || body.submissionContext === undefined)
    return text;
  return body.diagnosticsContext === ""
    ? body.userText
    : petrinautContextualUserMessageBody({
        userText: body.userText,
        diagnosticsContext: body.diagnosticsContext,
      });
};

const projectMessage = (
  message: Message,
  results: BrowserCallResults,
  withReadBack: boolean,
): Message => {
  if (message.role === "user")
    return typeof message.content === "string"
      ? { ...message, content: withoutSubmissionContext(message.content) }
      : {
          ...message,
          content: message.content.map((part) =>
            part.type === "text"
              ? { ...part, text: withoutSubmissionContext(part.text) }
              : part,
          ),
        };
  if (!withReadBack || message.role !== "toolResult") return message;
  const view = viewOf(message, results);
  const result = results(message.toolCallId);
  if (view?.kind !== "change" || result === undefined) return message;
  return {
    ...message,
    content: [
      {
        type: "text",
        text: JSON.stringify({
          output: result.output,
          netAfterChanges: view.readBack,
        }),
      },
    ],
  };
};

/** Brunch's projection of one request's messages; every other message passes through. */
export const projectContext = (
  messages: readonly Message[],
  results: BrowserCallResults,
): Message[] => {
  const withReadBack = readBackIndex(messages, results);
  return messages.map((message, index) =>
    projectMessage(message, results, index === withReadBack),
  );
};

export const contextProjectionExtension = defineExtension({
  name: "brunch.context-projection",
  hooks: [
    hook(GenerationTask, {
      beforeRequest: async ({ messages }, api, context) => ({
        messages: projectContext(
          messages,
          await browserCallResultsOf(api, context),
        ),
      }),
    }),
  ],
});
