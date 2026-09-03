import { CLIENT_TOOL_RESULT_SIGNAL } from "./client-tool-result";

import type {
  FlueConversationMessage,
  FlueConversationPart,
  FlueConversationState,
} from "@flue/sdk";
import type { UIMessage } from "ai";

type UiMessagePart = UIMessage["parts"][number];

export interface UiHistoryMessageMetadata {
  readonly source: "voice";
  readonly voiceToolCallIds?: readonly string[];
}

export type UiHistoryMessage = Omit<
  UIMessage<UiHistoryMessageMetadata>,
  "metadata" | "parts" | "role"
> & {
  metadata?: UiHistoryMessageMetadata;
  role: Extract<UIMessage["role"], "assistant" | "user">;
  parts: UiMessagePart[];
};

export interface SnapshotToUiMessagesOptions {
  readonly clientToolNames: ReadonlySet<string>;
}

const unhandledConversationPart = (part: never): never => {
  throw new Error(`Unhandled Flue conversation part: ${JSON.stringify(part)}`);
};

const isFlueDataPart = (
  part: FlueConversationPart,
): part is Extract<FlueConversationPart, { type: `data-${string}` }> =>
  part.type.startsWith("data-");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

interface ClientToolResult {
  readonly output: unknown;
  readonly source?: "voice";
}

const clientToolResultsFrom = (
  snapshot: Pick<FlueConversationState, "messages">,
  signalName: string,
): ReadonlyMap<string, ClientToolResult> => {
  const resultsByCallId = new Map<string, ClientToolResult>();
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    for (const result of parsed) {
      if (
        !isRecord(result) ||
        typeof result.toolCallId !== "string" ||
        !("output" in result)
      ) {
        continue;
      }
      resultsByCallId.set(result.toolCallId, {
        output: result.output,
        ...(result.source === "voice" ? { source: "voice" } : {}),
      });
    }
  }
  return resultsByCallId;
};

const toolPartFrom = (
  part: Extract<FlueConversationPart, { type: "dynamic-tool" }>,
  clientToolNames: ReadonlySet<string>,
  clientResults: ReadonlyMap<string, ClientToolResult>,
): UiMessagePart => {
  const isClientTool = clientToolNames.has(part.toolName);
  const hasClientOutput = clientResults.has(part.toolCallId);
  if (part.state === "output-error") {
    return {
      type: `tool-${part.toolName}`,
      toolCallId: part.toolCallId,
      state: "output-error",
      input: part.input,
      errorText: part.errorText,
      ...(isClientTool ? {} : { providerExecuted: true }),
    };
  }
  if (isClientTool && !hasClientOutput) {
    return {
      type: `tool-${part.toolName}`,
      toolCallId: part.toolCallId,
      state: "input-available",
      input: part.input,
    };
  }
  const output = isClientTool
    ? clientResults.get(part.toolCallId)?.output
    : part.state === "output-available"
      ? part.output
      : undefined;
  if (output !== undefined || hasClientOutput) {
    return {
      type: `tool-${part.toolName}`,
      toolCallId: part.toolCallId,
      state: "output-available",
      input: part.input,
      output,
      ...(isClientTool ? {} : { providerExecuted: true }),
    };
  }
  return {
    type: `tool-${part.toolName}`,
    toolCallId: part.toolCallId,
    state: "input-available",
    input: part.input,
    ...(isClientTool ? {} : { providerExecuted: true }),
  };
};

const partsFrom = (
  message: FlueConversationMessage,
  options: SnapshotToUiMessagesOptions,
  clientResults: ReadonlyMap<string, ClientToolResult>,
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
      parts.push(toolPartFrom(part, options.clientToolNames, clientResults));
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
  snapshot: Pick<FlueConversationState, "messages">,
  options: SnapshotToUiMessagesOptions,
): UiHistoryMessage[] => {
  const clientResults = clientToolResultsFrom(
    snapshot,
    CLIENT_TOOL_RESULT_SIGNAL,
  );
  const messages: UiHistoryMessage[] = [];
  // The live stream projects a client-tool continuation onto the assistant
  // message it resumes; the snapshot records that continuation as a separate
  // Flue message behind the `client-tool-result` dispatch, so fold it back.
  let resumableAssistant: UiHistoryMessage | undefined;
  let continuationPending = false;
  for (const message of snapshot.messages) {
    if (
      message.purpose === "dispatch" &&
      message.signal?.tagName === CLIENT_TOOL_RESULT_SIGNAL
    ) {
      continuationPending = resumableAssistant !== undefined;
      continue;
    }
    if (message.display !== "visible") continue;
    if (message.purpose !== "user" && message.purpose !== "assistant") continue;
    if (message.role !== "user" && message.role !== "assistant") continue;
    const parts = partsFrom(message, options, clientResults);
    if (message.role === "user") {
      resumableAssistant = undefined;
      continuationPending = false;
    }
    if (parts.length === 0) continue;
    if (
      message.role === "assistant" &&
      continuationPending &&
      resumableAssistant !== undefined
    ) {
      resumableAssistant.parts.push(...parts);
      continuationPending = false;
      continue;
    }
    const voiceToolCallIds =
      message.role === "assistant"
        ? message.parts.flatMap((part) =>
            part.type === "dynamic-tool" &&
            clientResults.get(part.toolCallId)?.source === "voice"
              ? [part.toolCallId]
              : [],
          )
        : [];
    const projected: UiHistoryMessage = {
      id: message.id,
      role: message.role,
      parts,
      ...(voiceToolCallIds.length > 0
        ? {
            metadata: {
              source: "voice",
              voiceToolCallIds,
            },
          }
        : {}),
    };
    messages.push(projected);
    if (message.role === "assistant") {
      resumableAssistant = projected;
    }
  }
  return messages;
};
