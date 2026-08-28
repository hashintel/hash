/** Recover Mission 3 workpieces from a Flue `history()` snapshot. */

import type { FlueConversationPart, FlueConversationSnapshot } from "@flue/sdk";

export const RUNBOOK_IR_FENCE = "runbook-ir";

const fencedBlockPattern = (language: string): RegExp =>
  new RegExp("```" + language + "\\s*\\n([\\s\\S]*?)```", "g");

export const latestFencedBlock = (
  text: string,
  language: string,
): string | undefined => {
  const matches = [...text.matchAll(fencedBlockPattern(language))];
  const last = matches.at(-1)?.[1];
  return last === undefined ? undefined : last.trim();
};

const assistantTextFrom = (snapshot: FlueConversationSnapshot): string =>
  snapshot.messages
    .filter((message) => message.purpose === "assistant")
    .flatMap((message) =>
      message.parts.filter(
        (part): part is Extract<FlueConversationPart, { type: "text" }> =>
          part.type === "text",
      ),
    )
    .map((part) => part.text)
    .join("\n\n");

export const recoverRunbookIr = (
  snapshot: FlueConversationSnapshot,
): string | undefined =>
  latestFencedBlock(assistantTextFrom(snapshot), RUNBOOK_IR_FENCE);

export const interviewerToolNamesFrom = (
  snapshot: FlueConversationSnapshot,
): readonly string[] => [
  ...new Set(
    snapshot.messages.flatMap((message) =>
      message.parts
        .filter((part) => part.type === "dynamic-tool")
        .map((part) => part.toolName),
    ),
  ),
];

export const skillResourcePathsFrom = (
  snapshot: FlueConversationSnapshot,
): readonly string[] =>
  snapshot.messages.flatMap((message) =>
    message.parts.flatMap((part) => {
      if (part.type !== "dynamic-tool") return [];
      if (part.toolName !== "read_skill_resource") return [];
      if (
        typeof part.input !== "object" ||
        part.input === null ||
        !("path" in part.input) ||
        typeof part.input.path !== "string"
      ) {
        return [];
      }
      return [part.input.path];
    }),
  );
