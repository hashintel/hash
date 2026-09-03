/** Human-readable projection of Flue's public conversation snapshot. */

import {
  type FlueConversationMessage,
  type FlueConversationPart,
  type FlueConversationSnapshot,
} from "@flue/sdk";

import { CLIENT_TOOL_RESULT_SIGNAL, isAwaitingClient } from "./client-tools.ts";

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

const resolveToolOutput = (
  part: Extract<FlueConversationPart, { type: "dynamic-tool" }>,
  clientOutputs: ReadonlyMap<string, unknown>,
): unknown => {
  const clientOutput = clientOutputs.get(part.toolCallId);
  if (part.state === "output-available" && isAwaitingClient(part.output)) {
    return clientOutput;
  }
  if (part.state === "output-available") {
    return part.output;
  }
  return clientOutput;
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
  const output = resolveToolOutput(part, clientOutputs);
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
      if (part.type === "text" || part.type === "reasoning") continue;
      if (part.type === "dynamic-tool") {
        lines.push(formatToolPart(part, clientOutputs));
        continue;
      }
      if (part.type === "file") {
        lines.push(`- file ${part.filename ?? part.mediaType}`);
        continue;
      }
      if (isFlueDataPart(part)) {
        lines.push(
          `- data ${part.type.slice("data-".length)}: ${JSON.stringify(part.data)}`,
        );
        continue;
      }
      unhandledConversationPart(part);
    }
    if (lines.length === 0) continue;
    sections.push(`## ${speaker}\n${lines.join("\n")}`);
  }
  return sections.join("\n\n");
};
