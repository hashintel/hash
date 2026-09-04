import { CLIENT_TOOL_RESULT_SIGNAL } from "./client-tool-result";

import type {
  FlueConversationMessage,
  FlueConversationPart,
  FlueConversationState,
} from "@flue/sdk";
import type { UIMessage } from "ai";

type UiMessagePart = UIMessage["parts"][number];

export type UiHistoryMessage = Omit<
  UIMessage,
  "metadata" | "parts" | "role"
> & {
  role: Extract<UIMessage["role"], "assistant" | "user">;
  parts: UiMessagePart[];
};

export interface SnapshotToUiMessagesOptions {
  readonly clientToolNames: ReadonlySet<string>;
  readonly mapClientToolInput?: (input: {
    readonly input: unknown;
    readonly toolName: string;
  }) => unknown;
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

const clientToolResultsFrom = (
  snapshot: Pick<FlueConversationState, "messages">,
  signalName: string,
): ReadonlyMap<string, unknown> => {
  const outputsByCallId = new Map<string, unknown>();
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
      outputsByCallId.set(result.toolCallId, result.output);
    }
  }
  return outputsByCallId;
};

const toolPartFrom = (
  part: Extract<FlueConversationPart, { type: "dynamic-tool" }>,
  options: SnapshotToUiMessagesOptions,
  clientOutputs: ReadonlyMap<string, unknown>,
): UiMessagePart => {
  const isClientTool = options.clientToolNames.has(part.toolName);
  const hasClientOutput = clientOutputs.has(part.toolCallId);
  const input =
    isClientTool && options.mapClientToolInput !== undefined
      ? options.mapClientToolInput({
          input: part.input,
          toolName: part.toolName,
        })
      : part.input;
  if (part.state === "output-error") {
    return {
      type: `tool-${part.toolName}`,
      toolCallId: part.toolCallId,
      state: "output-error",
      input,
      errorText: part.errorText,
      ...(isClientTool ? {} : { providerExecuted: true }),
    };
  }
  if (isClientTool && !hasClientOutput) {
    return {
      type: `tool-${part.toolName}`,
      toolCallId: part.toolCallId,
      state: "input-available",
      input,
    };
  }
  const output = isClientTool
    ? clientOutputs.get(part.toolCallId)
    : part.state === "output-available"
      ? part.output
      : undefined;
  if (output !== undefined || hasClientOutput) {
    return {
      type: `tool-${part.toolName}`,
      toolCallId: part.toolCallId,
      state: "output-available",
      input,
      output,
      ...(isClientTool ? {} : { providerExecuted: true }),
    };
  }
  return {
    type: `tool-${part.toolName}`,
    toolCallId: part.toolCallId,
    state: "input-available",
    input,
    ...(isClientTool ? {} : { providerExecuted: true }),
  };
};

const partsFrom = (
  message: FlueConversationMessage,
  options: SnapshotToUiMessagesOptions,
  clientOutputs: ReadonlyMap<string, unknown>,
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
      parts.push(toolPartFrom(part, options, clientOutputs));
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
  const clientOutputs = clientToolResultsFrom(
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
    const parts = partsFrom(message, options, clientOutputs);
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
    const projected: UiHistoryMessage = {
      id: message.id,
      role: message.role,
      parts,
    };
    messages.push(projected);
    if (message.role === "assistant") {
      resumableAssistant = projected;
    }
  }
  return messages;
};
