import { petrinautUserMessageText } from "@hashintel/brunch-agent";

import { formatAskedQuestions } from "../shared/format-persona-questions.ts";
import { personaQuestionsIn } from "../shared/offered-questions.ts";

import type { PersonaTranscriptEntry } from "../rpc-protocol.ts";
import type {
  FlueConversationMessage,
  FlueConversationSnapshot,
} from "@flue/sdk";

/** The prose a message shows the persona, if it is one the transcript keeps. */
const visibleEntry = (
  message: FlueConversationMessage,
): PersonaTranscriptEntry | undefined => {
  if (message.purpose !== "user" && message.purpose !== "assistant")
    return undefined;
  const rawText = message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n\n")
    .trim();
  const text =
    message.purpose === "user" ? petrinautUserMessageText(rawText) : rawText;
  if (!text) return undefined;
  return { speaker: message.purpose === "user" ? "user" : "brunch", text };
};

/**
 * Whether every submission behind a turn's messages settled as completed:
 * its own submission and any browser-tool continuation. A failed, stopped
 * or unsettled turn docked nothing the persona could answer.
 */
const completed = (
  turn: readonly FlueConversationMessage[],
  snapshot: FlueConversationSnapshot,
) => {
  const submissionIds = new Set(
    turn.flatMap(({ submissionId }) => (submissionId ? [submissionId] : [])),
  );
  return (
    submissionIds.size > 0 &&
    turn.every(({ settlement }) => settlement === undefined) &&
    [...submissionIds].every(
      (submissionId) =>
        snapshot.settlements.find(
          (settlement) => settlement.submissionId === submissionId,
        )?.outcome === "completed",
    )
  );
};

/**
 * The visible prose each side typed. Under a completed turn's last reply,
 * the questions it docked, as a record: other tool traffic stays
 * operator-side.
 */
export const personaTranscriptFrom = (
  snapshot: FlueConversationSnapshot,
): PersonaTranscriptEntry[] => {
  // A turn runs from one persona message to the next; continuations add no text.
  const turns: FlueConversationMessage[][] = [[]];
  for (const message of snapshot.messages) {
    if (message.purpose === "user" && visibleEntry(message)) turns.push([]);
    turns.at(-1)!.push(message);
  }
  return turns.flatMap((turn) => {
    const entries = turn.flatMap((message) => visibleEntry(message) ?? []);
    const questions = completed(turn, snapshot)
      ? personaQuestionsIn(turn.flatMap(({ parts }) => parts))
      : [];
    if (questions.length === 0) return entries;
    const asked = formatAskedQuestions(questions);
    const reply = entries.findLastIndex(({ speaker }) => speaker === "brunch");
    if (reply === -1) return entries.concat({ speaker: "brunch", text: asked });
    return entries.with(reply, {
      speaker: "brunch",
      text: `${entries[reply]!.text}\n\n${asked}`,
    });
  });
};
