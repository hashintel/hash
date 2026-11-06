/**
 * The durable agents server's conversation registry on the compose Postgres:
 * one schema per conversation on one shared pool per process, and ownership
 * moving between two server instances (two processes, two pools) that serve
 * the same conversation.
 */
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createRegistry } from "@earendil-works/pi-durable";
import { DefaultChatTransport, type UIMessage, type UIMessageChunk } from "ai";
import { Pool } from "pg";
import { afterAll, expect, test } from "vitest";

import {
  browserCallExtension,
  browserToolName,
  claimBrowserCall,
  finishBrowserCall,
} from "../../src/browser-call/browser-call";
import {
  conversationSchema,
  type OpenConversationStorage,
  postgresConversationStorage,
} from "../../src/server/conversation-storage";
import { createDurableAgentsServer } from "../../src/server/durable-agents-server";
import { postgresConfigFromEnvironment } from "../../src/storage/postgres/postgres-config";
import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../scripted-model";

import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";

const context = BACKGROUND_CONTEXT;
const poolConfig = postgresConfigFromEnvironment();
const admin = new Pool({ ...poolConfig, max: 1 });
const origin = "http://durable.test";
const toolCallId = "call-1";

afterAll(() => admin.end());

/** One server process: its own shared pool, its own model, opens counted per conversation. */
const startInstance = (responses: FauxResponseStep[]) => {
  const pool = new Pool(poolConfig);
  const opens = new Map<string, number>();
  const postgres = postgresConversationStorage(pool);
  const openStorage: OpenConversationStorage = (conversationId) => {
    opens.set(conversationId, (opens.get(conversationId) ?? 0) + 1);
    return postgres(conversationId);
  };
  const { models, model, state } = scriptedModel(responses);
  const server = createDurableAgentsServer({
    openStorage,
    createRegistry: () => {
      const registry = createRegistry();
      registry.install(browserCallExtension);
      return registry;
    },
    models,
    agent: { model },
    clientToolNames: new Set([browserToolName]),
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
  return {
    pool,
    opens,
    server,
    transport,
    modelRequests: () => state.callCount,
    close: async () => {
      await server.close();
      await pool.end();
    },
  };
};

const userMessage = (id: string, text: string): UIMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
});

const send = (
  instance: ReturnType<typeof startInstance>,
  chatId: string,
  message: UIMessage,
) =>
  instance.transport.sendMessages({
    trigger: "submit-message",
    chatId,
    messageId: undefined,
    messages: [message],
    abortSignal: undefined,
  });

/** Read a chunk stream, keeping every chunk read. */
const recorder = (stream: ReadableStream<UIMessageChunk>) => {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  const until = async (predicate: (chunk: UIMessageChunk) => boolean) => {
    for (;;) {
      // Each read depends on the one before.
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) return undefined;
      chunks.push(value);
      if (predicate(value)) return value;
    }
  };
  return {
    chunks,
    until,
    drain: () => until(() => false),
    cancel: () => reader.cancel(),
    text: () =>
      chunks
        .flatMap((chunk) => (chunk.type === "text-delta" ? [chunk.delta] : []))
        .join(""),
    start: () => chunks.find(({ type }) => type === "start"),
  };
};

const schemaExists = async (schema: string) =>
  (
    await admin.query(
      "SELECT 1 FROM information_schema.schemata WHERE schema_name = $1",
      [schema],
    )
  ).rowCount === 1;

test("conversations get their own schemas, and an instance that lost one reopens it before serving", async () => {
  const first = `chat-${randomUUID()}`;
  const second = `chat-${randomUUID()}`;
  const instanceA = startInstance([
    fauxAssistantMessage("A answered the first conversation."),
    fauxAssistantMessage("A answered the second conversation."),
    fauxAssistantMessage("A finished the rename."),
  ]);
  const instanceB = startInstance([
    fauxAssistantMessage(
      fauxToolCall(browserToolName, { title: "Dryer" }, { id: toolCallId }),
      { stopReason: "toolUse" },
    ),
  ]);
  try {
    // Two conversations on A: two schemas, both opened on A's one pool.
    const firstTurn = recorder(
      await send(instanceA, first, userMessage("first-1", "Hello.")),
    );
    await firstTurn.drain();
    const secondTurn = recorder(
      await send(instanceA, second, userMessage("second-1", "Hello.")),
    );
    await secondTurn.drain();
    expect(firstTurn.text()).toBe("A answered the first conversation.");
    expect(secondTurn.text()).toBe("A answered the second conversation.");
    expect(conversationSchema(first)).not.toBe(conversationSchema(second));
    expect(await schemaExists(conversationSchema(first))).toBe(true);
    expect(await schemaExists(conversationSchema(second))).toBe(true);
    expect(Object.fromEntries(instanceA.opens)).toEqual({
      [first]: 1,
      [second]: 1,
    });

    // B serves the first conversation: it takes ownership, and its turn waits on the browser.
    const onB = recorder(
      await send(instanceB, first, userMessage("first-2", "Rename the net.")),
    );
    await onB.until(({ type }) => type === "tool-input-available");
    expect(instanceB.opens.get(first)).toBe(1);

    // A, from memory, would call the conversation idle. It finds it lost the
    // schema, reopens it, and follows the run B started.
    const reattached = await instanceA.transport.reconnectToStream({
      chatId: first,
    });
    expect(reattached).not.toBeNull();
    expect(instanceA.opens.get(first)).toBe(2);
    const onA = recorder(reattached!);
    await onA.until(({ type }) => type === "tool-input-available");
    expect(onA.start()).toEqual(onB.start());

    // The waiting call survived the move: A's browser finishes it, and A's model answers.
    const claimOnA = async () => {
      for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const open = await instanceA.server.conversations.acquire(first);
        const { harness, root } = open;
        // eslint-disable-next-line no-await-in-loop
        const claim = await claimBrowserCall(
          harness,
          root.id,
          toolCallId,
          context,
        );
        if (claim !== undefined) return { harness, root, claim };
        // eslint-disable-next-line no-await-in-loop
        await sleep(10);
      }
    };
    const { harness, root, claim } = await claimOnA();
    const finished = await finishBrowserCall(
      harness,
      {
        conversationId: root.id,
        toolCallId,
        toolName: claim.toolName,
        capability: claim.capability,
        canonicalInput: claim.input,
        output: { ok: true, title: "Dryer" },
      },
      context,
    );
    expect(finished).toBe("settled");
    await onA.drain();
    expect(onA.text()).toBe("A finished the rename.");
    expect(onA.chunks.at(-1)).toEqual({ type: "finish", finishReason: "stop" });
    expect(instanceA.modelRequests()).toBe(3);
    expect(instanceB.modelRequests()).toBe(1);
    // A's run of the first conversation never reopened the second.
    expect(instanceA.opens.get(second)).toBe(1);

    // B's stream followed a Harness that no longer owns the conversation: it hears nothing more.
    await onB.cancel();
  } finally {
    await Promise.allSettled([instanceA.close(), instanceB.close()]);
    await admin.query(
      `DROP SCHEMA IF EXISTS "${conversationSchema(first)}" CASCADE`,
    );
    await admin.query(
      `DROP SCHEMA IF EXISTS "${conversationSchema(second)}" CASCADE`,
    );
  }
});
