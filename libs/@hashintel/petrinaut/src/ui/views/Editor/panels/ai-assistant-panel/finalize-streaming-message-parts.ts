import type { PetrinautAiMessage, PetrinautReasoningMetadata } from "./types";

type MessagePart = PetrinautAiMessage["parts"][number];

/**
 * The AI SDK's `stop()` only aborts the in-flight request — it never sends the
 * `reasoning-end` / `text-end` chunks that would move a streaming part to its
 * `"done"` state. Left untouched, a reasoning part keeps `state: "streaming"`,
 * so the panel's elapsed-time counter keeps ticking and the shimmer keeps
 * animating even though nothing is happening.
 *
 * This helper walks the most recent message and settles any still-streaming
 * reasoning or text part:
 *
 * - reasoning -> `"done"`, with `providerMetadata.petrinaut.finishedAt` set to
 *   now (preserving `startedAt`) so the frozen elapsed time is accurate.
 * - text -> `"done"`.
 *
 * Only the last message can hold streaming parts after an abort, so we leave
 * the rest of the transcript untouched. When nothing was streaming we return
 * the original array (same reference) so callers can skip a re-render.
 */
export const finalizeStreamingMessageParts = (
  messages: PetrinautAiMessage[],
): PetrinautAiMessage[] => {
  if (messages.length === 0) {
    return messages;
  }

  const lastIndex = messages.length - 1;
  const lastMessage = messages[lastIndex]!;

  const hasStreamingPart = lastMessage.parts.some(
    (part) =>
      (part.type === "reasoning" || part.type === "text") &&
      part.state === "streaming",
  );

  if (!hasStreamingPart) {
    return messages;
  }

  const finishedAt = Date.now();

  const nextParts = lastMessage.parts.map((part): MessagePart => {
    if (part.type === "reasoning" && part.state === "streaming") {
      const existing = part.providerMetadata as
        | PetrinautReasoningMetadata
        | undefined;
      return {
        ...part,
        state: "done",
        providerMetadata: {
          ...part.providerMetadata,
          petrinaut: {
            ...existing?.petrinaut,
            finishedAt,
          },
        },
      };
    }

    if (part.type === "text" && part.state === "streaming") {
      return { ...part, state: "done" };
    }

    return part;
  });

  const nextMessages = messages.slice();
  nextMessages[lastIndex] = { ...lastMessage, parts: nextParts };
  return nextMessages;
};
