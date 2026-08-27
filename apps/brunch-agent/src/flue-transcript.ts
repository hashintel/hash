/** Human-readable and UI-message projections of Flue's public conversation snapshot. */

import {
  type FlueConversationMessage,
  type FlueConversationPart,
  type FlueConversationSnapshot,
} from "@flue/sdk";

const CLIENT_TOOL_RESULT_SIGNAL = "client-tool-result";
const AWAITING_CLIENT = "awaiting";

type UiMessagePart =
  | { readonly type: "text"; readonly text: string; readonly state: "done" }
  | {
      readonly type: "reasoning";
      readonly text: string;
      readonly state: "done";
    }
  | {
      readonly type: `tool-${string}`;
      readonly toolCallId: string;
      readonly state: "output-available" | "output-error" | "input-available";
      readonly input: unknown;
      readonly output?: unknown;
      readonly errorText?: string;
      readonly providerExecuted?: boolean;
    };

export interface UiHistoryMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly parts: readonly UiMessagePart[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const clientToolResultsFrom = (
  snapshot: FlueConversationSnapshot,
): ReadonlyMap<string, unknown> => {
  const outputsByCallId = new Map<string, unknown>();
  for (const message of snapshot.messages) {
    if (message.purpose !== "dispatch") continue;
    if (message.signal?.tagName !== CLIENT_TOOL_RESULT_SIGNAL) continue;
    const parsed: unknown = (() => {
      try {
        return JSON.parse(
          message.parts
            .filter(
              (part): part is Extract<FlueConversationPart, { type: "text" }> =>
                part.type === "text",
            )
            .map((part) => part.text)
            .join(""),
        ) as unknown;
      } catch {
        return undefined;
      }
    })();
    const results = Array.isArray(parsed) ? parsed : [];
    for (const result of results) {
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

const isAwaitingClient = (output: unknown): boolean =>
  isRecord(output) && output[AWAITING_CLIENT] === "client";

const toolPartFrom = (
  part: Extract<FlueConversationPart, { type: "dynamic-tool" }>,
  clientOutputs: ReadonlyMap<string, unknown>,
): UiMessagePart => {
  const clientOutput = clientOutputs.get(part.toolCallId);
  const output =
    part.state === "output-available" && isAwaitingClient(part.output)
      ? (clientOutput ?? part.output)
      : part.state === "output-available"
        ? part.output
        : clientOutput;
  const providerExecuted =
    part.state === "output-available" && !isAwaitingClient(part.output)
      ? true
      : undefined;
  if (part.state === "output-error") {
    return {
      type: `tool-${part.toolName}`,
      toolCallId: part.toolCallId,
      state: "output-error",
      input: part.input,
      errorText: part.errorText,
      ...(providerExecuted === undefined ? {} : { providerExecuted }),
    };
  }
  if (output !== undefined) {
    return {
      type: `tool-${part.toolName}`,
      toolCallId: part.toolCallId,
      state: "output-available",
      input: part.input,
      output,
      ...(providerExecuted === undefined ? {} : { providerExecuted }),
    };
  }
  return {
    type: `tool-${part.toolName}`,
    toolCallId: part.toolCallId,
    state: "input-available",
    input: part.input,
  };
};

const partsFrom = (
  message: FlueConversationMessage,
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
      parts.push(toolPartFrom(part, clientOutputs));
    }
  }
  return parts;
};

export const snapshotToUiMessages = (
  snapshot: FlueConversationSnapshot,
): UiHistoryMessage[] => {
  const clientOutputs = clientToolResultsFrom(snapshot);
  const messages: UiHistoryMessage[] = [];
  for (const message of snapshot.messages) {
    if (message.display !== "visible") continue;
    if (message.purpose !== "user" && message.purpose !== "assistant") continue;
    if (message.role !== "user" && message.role !== "assistant") continue;
    const parts = partsFrom(message, clientOutputs);
    if (parts.length === 0) continue;
    messages.push({ id: message.id, role: message.role, parts });
  }
  return messages;
};

const textOf = (message: FlueConversationMessage): string =>
  message.parts
    .filter(
      (part): part is Extract<FlueConversationPart, { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("");

const formatToolPart = (
  part: Extract<FlueConversationPart, { type: "dynamic-tool" }>,
  clientOutputs: ReadonlyMap<string, unknown>,
): string => {
  const output =
    part.state === "output-available" && isAwaitingClient(part.output)
      ? (clientOutputs.get(part.toolCallId) ?? part.output)
      : part.state === "output-available"
        ? part.output
        : clientOutputs.get(part.toolCallId);
  const result =
    part.state === "output-error"
      ? `error: ${part.errorText}`
      : output === undefined
        ? "pending"
        : JSON.stringify(output);
  return `- tool ${part.toolName} (${part.toolCallId}): ${result}`;
};

/**
 * Built-in Flue `history()` snapshot → human-readable transcript.
 * User text, assistant text, and tool interactions, including client-tool
 * results delivered as signals.
 */
export const formatFlueTranscript = (
  snapshot: FlueConversationSnapshot,
): string => {
  const clientOutputs = clientToolResultsFrom(snapshot);
  const sections: string[] = [];
  for (const message of snapshot.messages) {
    if (message.purpose === "dispatch") {
      if (message.signal?.tagName !== CLIENT_TOOL_RESULT_SIGNAL) continue;
      const body = textOf(message);
      if (body.length === 0) continue;
      sections.push(`Signal ${CLIENT_TOOL_RESULT_SIGNAL}: ${body}`);
      continue;
    }
    if (message.display !== "visible") continue;
    if (message.purpose !== "user" && message.purpose !== "assistant") continue;
    const speaker = message.purpose === "user" ? "User" : "Assistant";
    const lines: string[] = [];
    const text = textOf(message);
    if (text.length > 0) lines.push(text);
    for (const part of message.parts) {
      if (part.type === "dynamic-tool") {
        lines.push(formatToolPart(part, clientOutputs));
      }
    }
    if (lines.length === 0) continue;
    sections.push(`## ${speaker}\n${lines.join("\n")}`);
  }
  return sections.join("\n\n");
};
