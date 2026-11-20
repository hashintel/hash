import { formatAskedQuestions } from "../shared/format-persona-questions.ts";
import { personaTurnsOf, visibleTextOf } from "../shared/persona-turns.ts";

import type { PersonaTranscriptEntry } from "../rpc-protocol.ts";
import type { FlueConversationSnapshot } from "@flue/sdk";

/**
 * The visible prose each side typed. Under a completed turn's last reply,
 * the questions it docked, as a record: other tool traffic stays
 * operator-side.
 */
export const personaTranscriptFrom = (
  snapshot: FlueConversationSnapshot,
): PersonaTranscriptEntry[] =>
  personaTurnsOf(snapshot).flatMap(({ messages, questions }) => {
    const entries = messages.flatMap((message): PersonaTranscriptEntry[] => {
      const text = visibleTextOf(message);
      if (text === undefined) return [];
      return [
        { speaker: message.purpose === "user" ? "user" : "brunch", text },
      ];
    });
    if (questions.length === 0) return entries;
    const asked = formatAskedQuestions(questions);
    const reply = entries.findLastIndex(({ speaker }) => speaker === "brunch");
    if (reply === -1) return entries.concat({ speaker: "brunch", text: asked });
    return entries.with(reply, {
      speaker: "brunch",
      text: `${entries[reply]!.text}\n\n${asked}`,
    });
  });
