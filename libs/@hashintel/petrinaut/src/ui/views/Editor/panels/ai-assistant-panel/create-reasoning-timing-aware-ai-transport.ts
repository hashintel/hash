import type { PetrinautAiTransport } from "./types";
import type { UIMessageChunk } from "ai";

/**
 * Build a fresh `TransformStream` that tags each reasoning-summary chunk with
 * Petrinaut timing metadata as it streams in from the model.
 *
 * The metadata lives under the `petrinaut` namespace inside the standard AI
 * SDK `providerMetadata` map. The SDK then merges per-chunk metadata into the
 * final `ReasoningUIPart` and that part is persisted alongside the rest of
 * the message — which gives the UI an accurate elapsed time that survives
 * panel close/reopen and new tabs, without any consumer-specific server code.
 *
 * `TransformStream`s are single-use, so this factory must be called fresh per
 * stream.
 */
const createReasoningTimingTransform = () =>
  new TransformStream<UIMessageChunk, UIMessageChunk>({
    transform(chunk, controller) {
      if (chunk.type === "reasoning-start") {
        controller.enqueue({
          ...chunk,
          providerMetadata: {
            ...chunk.providerMetadata,
            petrinaut: { startedAt: Date.now() },
          },
        });
        return;
      }
      if (chunk.type === "reasoning-end") {
        controller.enqueue({
          ...chunk,
          providerMetadata: {
            ...chunk.providerMetadata,
            petrinaut: { finishedAt: Date.now() },
          },
        });
        return;
      }
      controller.enqueue(chunk);
    },
  });

/**
 * Wrap a Petrinaut chat transport so that reasoning chunks pick up
 * client-side receipt timestamps as they arrive.
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
