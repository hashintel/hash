/**
 * The durable agents server over memory, as `src/server/durable-agents-server.test.ts`
 * builds it, with AI SDK's own transport calling it in-process.
 */
import {
  createRegistry,
  type Extension,
  MemoryStorage,
  type ModelRef,
} from "@earendil-works/pi-durable";
import { DefaultChatTransport, type UIMessage, type UIMessageChunk } from "ai";

import { browserCallExtension } from "../../src/browser-call/browser-call";
import { createDurableAgentsServer } from "../../src/server/durable-agents-server";
import { context } from "./support";

import type { OwnedStorage } from "../../src/server/conversation-storage";
import type { Models } from "@earendil-works/pi-ai/models";

const origin = "http://durable.test";

export const openMemoryServer = ({
  models,
  model,
  extensions = [],
}: {
  readonly models: Models;
  readonly model: ModelRef;
  readonly extensions?: readonly Extension[];
}) => {
  const stores = new Map<string, OwnedStorage>();
  const server = createDurableAgentsServer({
    openStorage: async (conversationId) => {
      const existing = stores.get(conversationId);
      if (existing !== undefined) return existing;
      const storage = Object.assign(new MemoryStorage(), {
        isOwner: async () => true,
      });
      stores.set(conversationId, storage);
      return storage;
    },
    storageExists: async (conversationId) => stores.has(conversationId),
    createRegistry: () => {
      const registry = createRegistry();
      registry.install(browserCallExtension);
      for (const extension of extensions) registry.install(extension);
      return registry;
    },
    models,
    agent: { model },
    clientToolNames: new Set(),
    context,
  });
  const transport = new DefaultChatTransport<UIMessage>({
    api: `${origin}/chat`,
    fetch: async (input, init) =>
      server.app.request(
        input instanceof Request ? input : String(input),
        init,
      ),
  });
  const send = (chatId: string, messageId: string, text: string) =>
    transport.sendMessages({
      trigger: "submit-message",
      chatId,
      messageId: undefined,
      messages: [
        { id: messageId, role: "user", parts: [{ type: "text", text }] },
      ],
      abortSignal: undefined,
    });
  const conversation = async (chatId: string) => {
    const open = await server.conversations.acquire(chatId);
    if (open === undefined) throw new Error(`No conversation ${chatId}.`);
    return open;
  };
  return { server, transport, send, conversation };
};

/** Every chunk of a stream, to its end. */
export const drain = async (
  stream: ReadableStream<UIMessageChunk>,
): Promise<UIMessageChunk[]> => {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    // eslint-disable-next-line no-await-in-loop -- Each read follows the last.
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(value);
  }
};

/** The text a chunk stream wrote, its deltas joined. */
export const streamedText = (chunks: readonly UIMessageChunk[]): string =>
  chunks
    .flatMap((chunk) => (chunk.type === "text-delta" ? [chunk.delta] : []))
    .join("");
