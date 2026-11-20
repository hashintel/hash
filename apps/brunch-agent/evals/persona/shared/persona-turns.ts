import { petrinautUserMessageText } from "@hashintel/brunch-agent";

import { personaQuestionsIn } from "./offered-questions.ts";

import type { PersonaQuestion } from "../rpc-protocol.ts";
import type {
  FlueConversationMessage,
  FlueConversationSnapshot,
} from "@flue/sdk";

/** The prose a persona or Brunch message shows, if it shows any. */
export const visibleTextOf = (
  message: FlueConversationMessage,
): string | undefined => {
  if (message.purpose !== "user" && message.purpose !== "assistant")
    return undefined;
  const rawText = message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n\n")
    .trim();
  const text =
    message.purpose === "user" ? petrinautUserMessageText(rawText) : rawText;
  return text || undefined;
};

/**
 * Whether every submission behind a turn's messages settled as completed:
 * its own and any browser-tool continuation recorded under another. A failed,
 * stopped or unsettled turn docked nothing the persona could answer.
 */
const completed = (
  messages: readonly FlueConversationMessage[],
  snapshot: FlueConversationSnapshot,
) => {
  const submissionIds = new Set(
    messages.flatMap(({ submissionId }) =>
      submissionId ? [submissionId] : [],
    ),
  );
  return (
    submissionIds.size > 0 &&
    messages.every(({ settlement }) => settlement === undefined) &&
    [...submissionIds].every(
      (submissionId) =>
        snapshot.settlements.find(
          (settlement) => settlement.submissionId === submissionId,
        )?.outcome === "completed",
    )
  );
};

export interface PersonaTurn {
  readonly messages: readonly FlueConversationMessage[];
  /** What the turn docked on the composer, once all of it completed. */
  readonly questions: readonly PersonaQuestion[];
}

/**
 * The conversation's turns: each runs from one persona message with visible
 * text to the next, so a continuation, which adds no text, stays in its turn
 * whichever submission records it. The one owner of a turn's extent, for the
 * live reply, resume and the transcript alike.
 */
export const personaTurnsOf = (
  snapshot: FlueConversationSnapshot,
): PersonaTurn[] => {
  const turns: FlueConversationMessage[][] = [[]];
  for (const message of snapshot.messages) {
    if (message.purpose === "user" && visibleTextOf(message)) turns.push([]);
    turns.at(-1)!.push(message);
  }
  return turns.map((messages) => ({
    messages,
    questions: completed(messages, snapshot)
      ? personaQuestionsIn(messages.flatMap(({ parts }) => parts))
      : [],
  }));
};
