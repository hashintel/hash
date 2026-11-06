/**
 * Spike: an AI SDK `ChatTransport` over a Pi Durable conversation served by
 * `createDurableChatServer`. Both directions read the same frames; the chunks
 * come from `createViewProjector`.
 */
import {
  createViewProjector,
  type ProjectionOptions,
} from "./durable-chat-transport/view-projector";

import type { ChatFrame, SubmitBody } from "./shared/chat-frame";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";

export type DurableChatTransportOptions = ProjectionOptions & {
  /** Origin and prefix of `createDurableChatServer`'s routes. */
  readonly baseUrl: string;
  readonly fetch?: (input: string, init?: RequestInit) => Promise<Response>;
};

/** Split an SSE body into its `data` payloads. */
const sseData = (body: ReadableStream<Uint8Array>): ReadableStream<string> => {
  let buffer = "";
  const decoder = new TextDecoder();
  return body.pipeThrough(
    new TransformStream<Uint8Array, string>({
      transform(bytes, controller) {
        buffer += decoder.decode(bytes, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const event of events) {
          const data = event
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (data.length > 0) controller.enqueue(data);
        }
      },
    }),
  );
};

const chunkStream = (
  body: ReadableStream<Uint8Array>,
  options: ProjectionOptions,
): ReadableStream<UIMessageChunk> => {
  let projector: ReturnType<typeof createViewProjector> | undefined;
  return sseData(body).pipeThrough(
    new TransformStream<string, UIMessageChunk>({
      start(controller) {
        projector = createViewProjector(options, (chunk) =>
          controller.enqueue(chunk),
        );
      },
      transform(data, controller) {
        projector?.accept(JSON.parse(data) as ChatFrame);
        if (projector?.isFinished()) controller.terminate();
      },
    }),
  );
};

const lastUserText = (messages: readonly UIMessage[]) => {
  const message = messages.at(-1);
  if (message?.role !== "user") throw new Error("No user message to submit.");
  const content = message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
  return {
    requestId: `ai-sdk:user:${message.id}`,
    content,
  } satisfies SubmitBody;
};

export const createDurableChatTransport = (
  options: DurableChatTransportOptions,
): ChatTransport<UIMessage> => {
  const fetch =
    options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const url = (chatId: string, path: string) =>
    `${options.baseUrl}/conversations/${encodeURIComponent(chatId)}/${path}`;

  return {
    sendMessages: async ({ trigger, chatId, messages, abortSignal }) => {
      if (trigger !== "submit-message") {
        throw new Error(
          "Regenerating a durable conversation is not supported.",
        );
      }
      const response = await fetch(url(chatId, "messages"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(lastUserText(messages)),
        signal: abortSignal,
      });
      if (!response.ok || response.body === null) {
        throw new Error(`Submission refused (${response.status}).`);
      }
      return chunkStream(response.body, options);
    },
    reconnectToStream: async ({ chatId, abortSignal }) => {
      const response = await fetch(url(chatId, "stream"), {
        signal: abortSignal,
      });
      if (response.status === 204) return null;
      if (!response.ok || response.body === null) {
        throw new Error(`Reconnect refused (${response.status}).`);
      }
      return chunkStream(response.body, options);
    },
  };
};
