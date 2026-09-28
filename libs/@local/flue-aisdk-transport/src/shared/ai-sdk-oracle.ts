import {
  asSchema,
  readUIMessageStream,
  uiMessageChunkSchema,
  UIMessageStreamError,
  validateUIMessages,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { afterEach } from "vitest";

const chunkSchema = asSchema(uiMessageChunkSchema);

export const streamOf = <T>(items: readonly T[]): ReadableStream<T> =>
  new ReadableStream<T>({
    start(controller) {
      for (const item of items) controller.enqueue(item);
      controller.close();
    },
  });

/** Every chunk must survive the AI SDK's HTTP wire schema. */
export const assertWireChunks = async (
  chunks: readonly UIMessageChunk[],
): Promise<void> => {
  for (const chunk of chunks) {
    // Chunk order is part of the failure report.
    // eslint-disable-next-line no-await-in-loop
    const result = await chunkSchema.validate?.(chunk);
    if (result?.success === false) {
      throw new Error(
        `The AI SDK wire schema rejects ${JSON.stringify(chunk)}.`,
        { cause: result.error },
      );
    }
  }
};

export interface ReducedUiMessage {
  /** The message the AI SDK reducer builds, if any chunk wrote one. */
  readonly message: UIMessage | undefined;
  /** Texts of `error` chunks, which the reducer reports rather than throws. */
  readonly streamErrors: readonly string[];
}

/**
 * Reduce chunks with the AI SDK's own reducer. A protocol violation (such as
 * a delta without its start, or an output for an unknown tool call) throws;
 * the reduced message must also pass `validateUIMessages`.
 */
export const reduceUiMessageChunks = async (
  chunks: readonly UIMessageChunk[],
  initialMessage?: UIMessage,
): Promise<ReducedUiMessage> => {
  await assertWireChunks(chunks);
  const streamErrors: string[] = [];
  let protocolError: unknown;
  let message: UIMessage | undefined;
  for await (const snapshot of readUIMessageStream({
    stream: streamOf(chunks),
    message: initialMessage,
    onError: (error) => {
      if (UIMessageStreamError.isInstance(error)) {
        protocolError ??= error;
      } else {
        streamErrors.push(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  })) {
    message = snapshot;
  }
  if (protocolError !== undefined) throw protocolError;
  if (message !== undefined) await validateUIMessages({ messages: [message] });
  return { message, streamErrors };
};

/**
 * For a test file: every chunk sequence recorded during a test must also
 * reduce cleanly through the AI SDK, checked after the test. Returns the
 * function that opens a new recording.
 */
export const useUiChunkRecorder = (): (() => UIMessageChunk[]) => {
  const recorded: UIMessageChunk[][] = [];
  afterEach(async () => {
    const sequences = recorded.splice(0);
    for (const chunks of sequences) {
      // Each sequence is reduced independently, in recording order.
      // eslint-disable-next-line no-await-in-loop
      await reduceUiMessageChunks(chunks);
    }
  });
  return () => {
    const chunks: UIMessageChunk[] = [];
    recorded.push(chunks);
    return chunks;
  };
};
