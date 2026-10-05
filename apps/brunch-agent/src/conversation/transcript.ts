/** Human-readable projection of Flue's public conversation snapshot. */

import type {
  FlueConversationMessage,
  FlueConversationPart,
  FlueConversationSnapshot,
} from "@flue/sdk";

const unhandledConversationPart = (part: never): never => {
  throw new Error(`Unhandled Flue conversation part: ${JSON.stringify(part)}`);
};

const isFlueDataPart = (
  part: FlueConversationPart,
): part is Extract<FlueConversationPart, { type: `data-${string}` }> =>
  part.type.startsWith("data-");

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
): string => {
  const output = part.state === "output-available" ? part.output : undefined;
  const result =
    part.state === "output-error"
      ? `error: ${part.errorText}`
      : output === undefined
        ? "pending"
        : JSON.stringify(output);
  return `- tool ${part.toolName} (${part.toolCallId}): ${result}`;
};

/** Built-in Flue `history()` snapshot → human-readable transcript. */
export const formatFlueTranscript = (
  snapshot: FlueConversationSnapshot,
): string => {
  const sections: string[] = [];
  for (const message of snapshot.messages) {
    if (message.display !== "visible") continue;
    if (message.purpose !== "user" && message.purpose !== "assistant") continue;
    const speaker = message.purpose === "user" ? "User" : "Assistant";
    const lines: string[] = [];
    const text = textOf(message);
    if (text.length > 0) lines.push(text);
    for (const part of message.parts) {
      if (part.type === "text" || part.type === "reasoning") continue;
      if (part.type === "dynamic-tool") {
        lines.push(formatToolPart(part));
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
