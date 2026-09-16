import { canonicalJsonEquals } from "./canonical-json";
import {
  CLIENT_TOOL_RESULT_SIGNAL,
  parseClientToolResults,
  type ClientToolResult,
} from "./client-tool-result";

import type { ClientToolProjectionOptions } from "./ui-stream";
import type {
  FlueConversationMessage,
  FlueConversationPart,
  FlueConversationState,
} from "@flue/sdk";
import type { UIMessage } from "ai";

type UiMessagePart = UIMessage["parts"][number];

export interface UiHistoryMessageMetadata {
  readonly source?: ClientToolResult["source"];
  readonly voiceToolCallIds?: readonly string[];
  readonly stopped?: true;
}

/** A reopened transcript never carries `system` messages. */
export type UiHistoryMessage = Omit<
  UIMessage<UiHistoryMessageMetadata>,
  "role"
> & {
  role: Extract<UIMessage["role"], "assistant" | "user">;
};

export type SnapshotToUiMessagesOptions = ClientToolProjectionOptions;

const unhandledConversationPart = (part: never): never => {
  throw new Error(`Unhandled Flue conversation part: ${JSON.stringify(part)}`);
};

const isFlueDataPart = (
  part: FlueConversationPart,
): part is Extract<FlueConversationPart, { type: `data-${string}` }> =>
  part.type.startsWith("data-");

/** The delivered result as history sees it, plus whether later deliveries disagreed. */
type ReconciledClientToolResult = Pick<
  ClientToolResult,
  "output" | "source" | "metadata"
> & { readonly conflict?: true };

const clientToolResultsFrom = (
  snapshot: Pick<FlueConversationState, "messages">,
  signalName: string,
): ReadonlyMap<string, ReconciledClientToolResult> => {
  const resultsByCallId = new Map<string, ReconciledClientToolResult>();
  for (const message of snapshot.messages) {
    if (message.purpose !== "dispatch") continue;
    if (message.signal?.tagName !== signalName) continue;
    const text = message.parts
      .filter(
        (part): part is Extract<FlueConversationPart, { type: "text" }> =>
          part.type === "text",
      )
      .map((part) => part.text)
      .join("");
    for (const result of parseClientToolResults(text)) {
      const previous = resultsByCallId.get(result.toolCallId);
      const conflict =
        previous?.conflict === true ||
        (previous !== undefined &&
          (!canonicalJsonEquals(previous.output, result.output) ||
            !canonicalJsonEquals(previous.metadata, result.metadata)));
      resultsByCallId.set(result.toolCallId, {
        output: previous === undefined ? result.output : previous.output,
        metadata: previous === undefined ? result.metadata : previous.metadata,
        ...(result.source === "voice" || previous?.source === "voice"
          ? { source: "voice" }
          : {}),
        ...(conflict ? { conflict: true } : {}),
      });
    }
  }
  return resultsByCallId;
};

const toolPartFrom = (
  part: Extract<FlueConversationPart, { type: "dynamic-tool" }>,
  options: SnapshotToUiMessagesOptions,
  clientResults: ReadonlyMap<string, ReconciledClientToolResult>,
): UiMessagePart => {
  const isClientTool = options.clientToolNames.has(part.toolName);
  const hasClientOutput = clientResults.has(part.toolCallId);
  const toolIdentity =
    options.dynamicClientToolNames?.has(part.toolName) === true
      ? ({ type: "dynamic-tool", toolName: part.toolName } as const)
      : ({ type: `tool-${part.toolName}` } as const);
  const input =
    isClientTool &&
    (!options.validatedClientToolNames?.has(part.toolName) ||
      part.state === "output-available") &&
    options.mapClientToolInput !== undefined
      ? options.mapClientToolInput({
          input: part.input,
          toolName: part.toolName,
          toolCallId: part.toolCallId,
        })
      : part.input;
  if (clientResults.get(part.toolCallId)?.conflict) {
    return {
      ...toolIdentity,
      toolCallId: part.toolCallId,
      state: "output-error",
      input,
      errorText:
        "Conflicting browser result deliveries; the outcome is unknown. Do not reapply.",
    };
  }
  if (part.state === "output-error") {
    return {
      ...toolIdentity,
      toolCallId: part.toolCallId,
      state: "output-error",
      input,
      errorText: part.errorText,
      ...(isClientTool ? {} : { providerExecuted: true }),
    };
  }
  if (
    isClientTool &&
    !hasClientOutput &&
    part.state !== "output-available" &&
    options.validatedClientToolNames?.has(part.toolName)
  ) {
    return {
      ...toolIdentity,
      toolCallId: part.toolCallId,
      state: "input-streaming",
      input,
    };
  }
  if (isClientTool && !hasClientOutput) {
    return {
      ...toolIdentity,
      toolCallId: part.toolCallId,
      state: "input-available",
      input,
    };
  }
  const output = isClientTool
    ? clientResults.get(part.toolCallId)?.output
    : part.state === "output-available"
      ? part.output
      : undefined;
  if (output !== undefined || hasClientOutput) {
    return {
      ...toolIdentity,
      toolCallId: part.toolCallId,
      state: "output-available",
      input,
      output,
      ...(isClientTool ? {} : { providerExecuted: true }),
    };
  }
  return {
    ...toolIdentity,
    toolCallId: part.toolCallId,
    state: "input-available",
    input,
    ...(isClientTool ? {} : { providerExecuted: true }),
  };
};

const partsFrom = (
  message: FlueConversationMessage,
  options: SnapshotToUiMessagesOptions,
  clientResults: ReadonlyMap<string, ReconciledClientToolResult>,
): UiMessagePart[] => {
  const parts: UiMessagePart[] = [];
  for (const part of message.parts) {
    if (part.type === "text") {
      parts.push({ type: "text", text: part.text, state: "done" });
      continue;
    }
    if (part.type === "reasoning") {
      parts.push({ type: "reasoning", text: part.text, state: "done" });
      continue;
    }
    if (part.type === "dynamic-tool") {
      if (options.hiddenToolNames?.has(part.toolName) === true) continue;
      parts.push(toolPartFrom(part, options, clientResults));
      continue;
    }
    if (part.type === "file") {
      parts.push({
        type: "file",
        mediaType: part.mediaType,
        url: part.url ?? "",
        ...(part.filename === undefined ? {} : { filename: part.filename }),
      });
      continue;
    }
    if (isFlueDataPart(part)) {
      parts.push({ type: part.type, data: part.data });
      continue;
    }
    unhandledConversationPart(part);
  }
  return parts;
};

export const snapshotToUiMessages = (
  snapshot: Pick<FlueConversationState, "messages"> &
    Partial<Pick<FlueConversationState, "settlements">>,
  options: SnapshotToUiMessagesOptions,
): UiHistoryMessage[] => {
  const clientResults = clientToolResultsFrom(
    snapshot,
    CLIENT_TOOL_RESULT_SIGNAL,
  );
  const messages: UiHistoryMessage[] = [];
  const abortedSubmissions = new Set(
    snapshot.settlements
      ?.filter(({ outcome }) => outcome === "aborted")
      .flatMap(({ submissionId, answeredBySubmissionId }) =>
        answeredBySubmissionId === undefined
          ? [submissionId]
          : [submissionId, answeredBySubmissionId],
      ),
  );
  // The live stream projects a client-tool continuation onto the assistant
  // message it resumes; the snapshot records that continuation as a separate
  // Flue message behind the `client-tool-result` dispatch, so fold it back.
  let resumableAssistant: UiHistoryMessage | undefined;
  let awaitingClientResult = false;
  let continuationPending = false;
  for (const message of snapshot.messages) {
    if (
      message.purpose === "dispatch" &&
      message.signal?.tagName === CLIENT_TOOL_RESULT_SIGNAL
    ) {
      awaitingClientResult = false;
      continuationPending = resumableAssistant !== undefined;
      continue;
    }
    if (message.display !== "visible") continue;
    if (message.purpose !== "user" && message.purpose !== "assistant") continue;
    if (message.role !== "user" && message.role !== "assistant") continue;
    const parts = partsFrom(message, options, clientResults);
    if (message.role === "user") {
      resumableAssistant = undefined;
      awaitingClientResult = false;
      continuationPending = false;
    }
    if (parts.length === 0) continue;
    const foldsIntoPrevious =
      message.role === "assistant" &&
      (awaitingClientResult || continuationPending) &&
      resumableAssistant !== undefined;
    const voiceToolCallIds =
      message.role === "assistant"
        ? message.parts.flatMap((part) =>
            part.type === "dynamic-tool" &&
            clientResults.get(part.toolCallId)?.source === "voice"
              ? [part.toolCallId]
              : [],
          )
        : [];
    const stopped =
      message.role === "assistant" &&
      message.submissionId !== undefined &&
      abortedSubmissions.has(message.submissionId);
    const metadata: UiHistoryMessageMetadata = {
      ...(voiceToolCallIds.length > 0
        ? { source: "voice" as const, voiceToolCallIds }
        : {}),
      ...(stopped ? { stopped: true as const } : {}),
    };
    awaitingClientResult =
      message.role === "assistant" &&
      !stopped &&
      message.parts.some(
        (part) =>
          part.type === "dynamic-tool" &&
          options.clientToolNames.has(part.toolName) &&
          !clientResults.has(part.toolCallId),
      );
    if (foldsIntoPrevious && resumableAssistant !== undefined) {
      // Live continuations start a new step. Keep that boundary after reopen
      // so completedClientToolResults still selects only the latest step.
      resumableAssistant.parts.push({ type: "step-start" }, ...parts);
      if (voiceToolCallIds.length > 0 || stopped) {
        const combinedOrigins = [
          ...new Set([
            ...(resumableAssistant.metadata?.voiceToolCallIds ?? []),
            ...voiceToolCallIds,
          ]),
        ];
        resumableAssistant.metadata = {
          ...resumableAssistant.metadata,
          ...metadata,
          ...(combinedOrigins.length > 0
            ? { voiceToolCallIds: combinedOrigins }
            : {}),
        };
      }
      continuationPending = false;
      continue;
    }
    const projected: UiHistoryMessage = {
      id: message.id,
      role: message.role,
      parts,
      ...(voiceToolCallIds.length > 0 || stopped ? { metadata } : {}),
    };
    messages.push(projected);
    if (message.role === "assistant") resumableAssistant = projected;
  }
  return messages;
};
