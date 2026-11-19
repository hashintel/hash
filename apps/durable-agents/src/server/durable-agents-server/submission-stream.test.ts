/**
 * A chat stream through the server's routes, with a faux model: it streams
 * its turn's response from the input and finishes, or ends with an error,
 * whatever the turn's length and whenever it attaches.
 */
import { setTimeout as sleep } from "node:timers/promises";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxProvider,
  type FauxResponseStep,
} from "@earendil-works/pi-ai/providers/faux";
import {
  createRegistry,
  defineExtension,
  defineTool,
  type Extension,
  MemoryStorage,
} from "@earendil-works/pi-durable";
import { obj } from "@earendil-works/pi-schema";
import {
  type ChatTransport,
  DefaultChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { afterEach, expect, test } from "vitest";

import {
  fauxAssistantMessage,
  fauxToolCall,
} from "../../../test/scripted-model";
import {
  browserCallExtension,
  browserToolName,
} from "../../browser-call/browser-call";
import {
  createDurableAgentsServer,
  type DurableAgentsServerLimits,
} from "../durable-agents-server";

import type { OwnedStorage } from "../conversation-storage";

const context = BACKGROUND_CONTEXT;
const origin = "http://durable.test";
const chatId = "chat-1";

const servers: { close: () => Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

type ChatOptions = {
  readonly responses: FauxResponseStep[];
  readonly extensions?: readonly Extension[];
  readonly limits?: Partial<DurableAgentsServerLimits>;
  /** Wraps each conversation's storage as it is created. */
  readonly wrapStorage?: (storage: OwnedStorage) => OwnedStorage;
};

/** A server on in-memory storage with a scripted model, and AI SDK's own client calling it in-process. */
const openChat = ({
  responses,
  extensions = [],
  limits,
  wrapStorage = (storage) => storage,
}: ChatOptions) => {
  const faux = fauxProvider({ tokensPerSecond: 2_000 });
  faux.setResponses(responses);
  const models = createModels();
  models.setProvider(faux.provider);
  const stores = new Map<string, OwnedStorage>();
  const server = createDurableAgentsServer({
    openStorage: async (conversationId) => {
      const existing = stores.get(conversationId);
      if (existing !== undefined) return existing;
      const storage = wrapStorage(
        Object.assign(new MemoryStorage(), { isOwner: async () => true }),
      );
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
    agent: {
      model: { provider: faux.provider.id, modelId: faux.getModel().id },
    },
    settings: { progress: { partialIntervalMs: 5, outputIntervalMs: 5 } },
    clientToolNames: new Set([browserToolName]),
    limits,
    context,
  });
  servers.push(server);
  const transport = new DefaultChatTransport<UIMessage>({
    api: `${origin}/chat`,
    fetch: async (input, init) =>
      server.app.request(
        input instanceof Request ? input : String(input),
        init,
      ),
  });
  return { server, transport, faux };
};

const userMessage = (id: string, text = "Go."): UIMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
});

const send = (transport: ChatTransport<UIMessage>, message: UIMessage) =>
  transport.sendMessages({
    trigger: "submit-message",
    chatId,
    messageId: undefined,
    messages: [message],
    abortSignal: undefined,
  });

/** `promise`, or a rejection naming `what` once `ms` pass first. */
const within = async <T>(what: string, promise: Promise<T>, ms = 3_000) => {
  const timeout = new AbortController();
  try {
    return await Promise.race([
      promise,
      sleep(ms, undefined, { signal: timeout.signal }).then(() => {
        throw new Error(`Timed out: ${what}.`);
      }),
    ]);
  } finally {
    timeout.abort();
  }
};

/** Read a chunk stream to its end, failing if it does not end in time. */
const drain = async (stream: ReadableStream<UIMessageChunk>, what: string) => {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  const read = async () => {
    for (;;) {
      // Each read depends on the one before.
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) return chunks;
      chunks.push(value);
    }
  };
  try {
    return await within(what, read());
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw new Error(
      `${String(error)} ${chunks.length} chunks read, the last ${JSON.stringify(chunks.at(-1))}.`,
    );
  }
};

const toolInputIds = (chunks: readonly UIMessageChunk[]) =>
  chunks.flatMap((chunk) =>
    chunk.type === "tool-input-available" ? [chunk.toolCallId] : [],
  );

const textOf = (chunks: readonly UIMessageChunk[]) =>
  chunks
    .flatMap((chunk) => (chunk.type === "text-delta" ? [chunk.delta] : []))
    .join("");

/** A server tool that answers at once. */
const pingTool = defineTool({
  name: "ping",
  description: "Answers pong.",
  parameters: obj({}),
  execute: async () => ({ output: [{ type: "text", text: "pong" }] }),
});

/** A server tool that answers once `release` resolves, telling `reached` when it starts. */
const holdTool = (
  reached: PromiseWithResolvers<void>,
  release: Promise<void>,
) =>
  defineTool({
    name: "hold",
    description: "Answers when released.",
    parameters: obj({}),
    execute: async () => {
      reached.resolve();
      await release;
      return { output: [{ type: "text", text: "released" }] };
    },
  });

const toolRound = (name: string, id: string) =>
  fauxAssistantMessage(fauxToolCall(name, {}, { id }), {
    stopReason: "toolUse",
  });

test("a turn with more than a window of entries after its input streams from its input, reattached mid-run and resent after it answered", async () => {
  // Each round is two entries, so more than 100 follow the input before the hold.
  const rounds = 60;
  const reached = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const pings = Array.from({ length: rounds }, (_, round) => `ping-${round}`);
  const { transport } = openChat({
    responses: [
      ...pings.map((id) => toolRound("ping", id)),
      toolRound("hold", "hold"),
      fauxAssistantMessage("Done."),
    ],
    extensions: [
      defineExtension({
        name: "test.tools",
        tools: [pingTool, holdTool(reached, release.promise)],
      }),
    ],
  });
  const message = userMessage("user-long");
  // Followed from the start, while its window drops the oldest entries.
  const first = drain(await send(transport, message), "the first stream");
  await within("the run to reach its hold", reached.promise);

  const reattached = await transport.reconnectToStream({ chatId });
  expect(reattached).not.toBeNull();
  release.resolve();
  const midRun = await drain(reattached!, "the reattached stream");
  expect(midRun[0]).toMatchObject({ type: "start" });
  expect(toolInputIds(midRun)).toEqual([...pings, "hold"]);
  expect(textOf(midRun)).toBe("Done.");
  expect(midRun.at(-1)).toEqual({ type: "finish", finishReason: "stop" });
  const followed = await first;
  expect(toolInputIds(followed)).toEqual([...pings, "hold"]);
  expect(followed.at(-1)).toEqual(midRun.at(-1));

  const resent = await drain(
    await send(transport, message),
    "the resent stream",
  );
  expect(resent[0]).toEqual(midRun[0]);
  expect(toolInputIds(resent)).toEqual([...pings, "hold"]);
  expect(textOf(resent)).toBe("Done.");
  expect(resent.at(-1)).toEqual({ type: "finish", finishReason: "stop" });
});
