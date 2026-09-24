import type { PersonaTranscriptEntry } from "../rpc-protocol.ts";
import type { FlueConversationSnapshot } from "@flue/sdk";

/** Only the visible prose each side typed; tool traffic stays operator-side. */
export const personaTranscriptFrom = (
  snapshot: FlueConversationSnapshot,
): PersonaTranscriptEntry[] =>
  snapshot.messages.flatMap((message) => {
    if (message.purpose !== "user" && message.purpose !== "assistant")
      return [];
    const text = message.parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n\n")
      .trim();
    if (!text) return [];
    return [
      { speaker: message.purpose === "user" ? "user" : "brunch", text },
    ] as const;
  });
