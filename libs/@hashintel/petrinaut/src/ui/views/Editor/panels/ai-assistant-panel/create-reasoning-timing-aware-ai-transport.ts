import type { PetrinautAiTransport } from "./types";
import type { UIMessageChunk } from "ai";

/**
 * Build a fresh `TransformStream` that tags every reasoning chunk with
 * Petrinaut timing metadata as it streams in from the model.
 *
 * The metadata lives under the `petrinaut` namespace inside the standard AI
 * SDK `providerMetadata` map. The SDK then merges per-chunk metadata into the
 * final `ReasoningUIPart`, which is persisted alongside the rest of the
 * message — so the UI can render an accurate elapsed time that survives the
 * panel being closed and reopened.
 *
 * Important: the AI SDK's stream reducer assigns `chunk.providerMetadata`
 * onto the part on every `reasoning-delta` (not a merge), so any chunk that
 * arrives with provider-supplied metadata (OpenAI emits its own on reasoning
 * deltas) will _replace_ whatever we set on `reasoning-start`. To survive,
 * we have to re-inject the timing under `petrinaut` on every reasoning
 * chunk for the same id — start, every delta, and end.
 *
 * `TransformStream`s are single-use, so this factory must be called fresh
 * per `sendMessages` / `reconnectToStream` call.
 */
const createReasoningTimingTransform = () => {
  const startedAtById = new Map<string, number>();

  return new TransformStream<UIMessageChunk, UIMessageChunk>({
    transform(chunk, controller) {
      if (chunk.type === "reasoning-start") {
        const startedAt = Date.now();
        startedAtById.set(chunk.id, startedAt);
        controller.enqueue({
          ...chunk,
          providerMetadata: {
            ...chunk.providerMetadata,
            petrinaut: { startedAt },
          },
        });
        return;
      }
      if (chunk.type === "reasoning-delta") {
        const startedAt = startedAtById.get(chunk.id);
        if (startedAt == null) {
          // Should not happen — `reasoning-start` always precedes deltas —
          // but be defensive and just pass the chunk through if the upstream
          // skipped the start event for some reason.
          controller.enqueue(chunk);
          return;
        }
        controller.enqueue({
          ...chunk,
          providerMetadata: {
            ...chunk.providerMetadata,
            petrinaut: { startedAt },
          },
        });
        return;
      }
      if (chunk.type === "reasoning-end") {
        const startedAt = startedAtById.get(chunk.id);
        startedAtById.delete(chunk.id);
        controller.enqueue({
          ...chunk,
          providerMetadata: {
            ...chunk.providerMetadata,
            petrinaut: {
              ...(startedAt != null ? { startedAt } : {}),
              finishedAt: Date.now(),
            },
          },
        });
        return;
      }
      controller.enqueue(chunk);
    },
  });
};

/**
 * Wrap a Petrinaut chat transport so reasoning chunks pick up client-side
 * receipt timestamps as they arrive.
 *
 * This is applied by `AiAssistantPanel` to every consumer-provided transport,
 * which means consumers do not have to plumb timing into their own backend.
 * The trade-off is that the timestamps reflect when chunks arrived at the
 * client rather than when the model emitted them — for SSE streams the gap
 * is just network latency, which is small relative to the reasoning durations
 * we display.
 */
export const createReasoningTimingAwareAiTransport = (
  transport: PetrinautAiTransport,
): PetrinautAiTransport => ({
  sendMessages: async (options) => {
    const stream = await transport.sendMessages(options);
    return stream.pipeThrough(createReasoningTimingTransform());
  },
  reconnectToStream: async (options) => {
    const stream = await transport.reconnectToStream(options);
    return stream
      ? stream.pipeThrough(createReasoningTimingTransform())
      : stream;
  },
});
