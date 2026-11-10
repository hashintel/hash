/**
 * The server on a saturated Postgres pool, on the compose Postgres: a pool of
 * one connection with a short wait, whose connection the test holds.
 *
 * - An HTTP request that cannot get a connection in time is answered 503
 *   with `Retry-After`, on every route.
 * - A durable commit inside a running turn that cannot get one (a model
 *   step, a tool result) fails its Harness: Pi Durable 1.5.0 does not retry
 *   the commit, and the run is not marked failed. The client's stream ends
 *   without a `finish`; the next request reopens the conversation, which
 *   resumes the run from its last commit. What was not committed is redone
 *   (the model request) or answered as cut off (the tool call), and the turn
 *   ends with one answer.
 */
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
  type FauxResponseStep,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import {
  AssistantEntry,
  createRegistry,
  defineExtension,
  defineTool,
  type SessionEnd,
  LiveDoc,
  ToolResultEntry,
} from "@earendil-works/pi-durable";
import { obj } from "@earendil-works/pi-schema";
import { DefaultChatTransport, type UIMessage, type UIMessageChunk } from "ai";
import { Pool, type PoolClient } from "pg";
import { afterAll, expect, test } from "vitest";

import {
  conversationSchema,
  postgresConversationExists,
  postgresConversationStorage,
} from "../../src/server/conversation-storage";
import { createDurableAgentsServer } from "../../src/server/durable-agents-server";
import {
  browserCallsPrefix,
  startDurableAgentsServer,
} from "../../src/server/start-durable-agents-server";
import { postgresConfigFromEnvironment } from "../../src/storage/postgres/postgres-config";
import { scriptedModel } from "../scripted-model";

const context = BACKGROUND_CONTEXT;
const poolConfig = postgresConfigFromEnvironment();
const admin = new Pool({ ...poolConfig, max: 1 });
afterAll(() => admin.end());

/** Long enough for a new connection to the compose Postgres; a held one is never freed within it. */
const waitMs = 1000;
const holdMs = 3000;

const dropSchema = (chatId: string) =>
  admin.query(`DROP SCHEMA IF EXISTS "${conversationSchema(chatId)}" CASCADE`);

const drain = async (stream: ReadableStream<UIMessageChunk>) => {
  const chunks: UIMessageChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
};

test("a request that gets no pool connection in time is answered 503 with Retry-After", async () => {
  const chatId = `pool-busy-${randomUUID()}`;
  const unknownId = `pool-busy-unknown-${randomUUID()}`;
  const pool = new Pool({
    ...poolConfig,
    max: 1,
    connectionTimeoutMillis: waitMs,
  });
  const { models, model } = scriptedModel([fauxAssistantMessage("Hello.")]);
  const server = await startDurableAgentsServer({
    port: 0,
    hostname: "127.0.0.1",
    pool,
    models,
    model,
  });
  const origin = `http://127.0.0.1:${server.port}`;
  const post = (path: string, body: unknown) =>
    fetch(`${origin}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const chat = (id: string, messageId: string) =>
    post("/chat", {
      id,
      trigger: "submit-message",
      messages: [
        { id: messageId, role: "user", parts: [{ type: "text", text: "Hi." }] },
      ],
      binding: { conversationId: id, documentId: `net-${randomUUID()}` },
    });
  let held: PoolClient | undefined;
  try {
    const created = await chat(chatId, "user-1");
    expect(created.status).toBe(200);
    expect(await created.text()).toContain("Hello.");

    held = await pool.connect();
    const call = `${browserCallsPrefix}/${chatId}/browser-calls/call-1`;
    const busy = await Promise.all([
      fetch(`${origin}/chat/${chatId}/stream`),
      post(`/chat/${chatId}/abort`, {}),
      chat(chatId, "user-2"),
      chat(unknownId, "user-1"),
      post(call, { claimant: "tab-1", binding: "binding" }),
      post(`${call}/start`, { capability: "capability", binding: "binding" }),
    ]);
    for (const response of busy) {
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("1");
    }
    held.release();
    held = undefined;

    // With the connection back, the same conversation serves again.
    expect((await fetch(`${origin}/chat/${chatId}/stream`)).status).toBe(204);
  } finally {
    held?.release();
    await server.close();
    await pool.end();
    await Promise.all([dropSchema(chatId), dropSchema(unknownId)]);
  }
});

/** A server on a one-connection pool with the faux model's `responses` and `tools`. */
const startInstance = (
  responses: FauxResponseStep[],
  tools: readonly ReturnType<typeof defineTool>[],
) => {
  const pool = new Pool({
    ...poolConfig,
    max: 1,
    connectionTimeoutMillis: waitMs,
  });
  const faux = fauxProvider();
  faux.setResponses(responses);
  const models = createModels();
  models.setProvider(faux.provider);
  const extension = defineExtension({ name: "probe", tools: [...tools] });
  const server = createDurableAgentsServer({
    openStorage: postgresConversationStorage(pool),
    storageExists: postgresConversationExists(pool),
    createRegistry: () => {
      const registry = createRegistry();
      registry.install(extension);
      return registry;
    },
    models,
    agent: {
      model: { provider: faux.provider.id, modelId: faux.getModel().id },
    },
    settings: { retry: { baseDelayMs: 10 } },
    clientToolNames: new Set(),
    context,
  });
  const transport = new DefaultChatTransport<UIMessage>({
    api: "http://durable.test/chat",
    fetch: async (input, init) =>
      server.app.request(
        input instanceof Request ? input : String(input),
        init,
      ),
  });
  /** Each Harness's end, once a commit took the connection away from it. */
  const harnessEnds: Promise<SessionEnd>[] = [];
  /** Hold the pool's only connection for `holdMs`, from inside the running turn. */
  const holdConnection = async (chatId: string) => {
    const open = await server.conversations.ifOwned(chatId);
    if (open !== undefined) harnessEnds.push(open.harness.closed);
    const client = await pool.connect();
    void sleep(holdMs).then(() => client.release());
  };
  return {
    server,
    transport,
    holdConnection,
    harnessEnds,
    modelRequests: () => faux.state.callCount,
    close: async () => {
      await server.close();
      await pool.end();
    },
  };
};

type Instance = ReturnType<typeof startInstance>;

/** Send one message, then, once the held connection is free, reconnect and let the turn finish. */
const runTurn = async (instance: Instance, chatId: string) => {
  const stream = await instance.transport.sendMessages({
    trigger: "submit-message",
    chatId,
    messageId: undefined,
    messages: [
      { id: "user-1", role: "user", parts: [{ type: "text", text: "Go." }] },
    ],
    abortSignal: undefined,
  });
  const first = await drain(stream);
  const end = await instance.harnessEnds.at(0);
  await sleep(holdMs);
  // Any request reopens the failed conversation, which resumes its run.
  const reconnected = await instance.transport.reconnectToStream({ chatId });
  const second = reconnected === null ? null : await drain(reconnected);
  const conversation = await instance.server.conversations.acquire(chatId);
  if (conversation === undefined) throw new Error(`No conversation ${chatId}.`);
  const { harness, root } = conversation;
  await root.waitForIdle(context);
  const live = await harness.snapshot(LiveDoc, root.id, context);
  const { items: entries } = await root.entries(
    { order: "ascending" },
    100,
    undefined,
    context,
  );
  return { first, end, second, live, entries };
};

test("a model step's commit that gets no connection fails the Harness; a reopen asks the model again and answers once", async () => {
  const chatId = `pool-timeout-model-${randomUUID()}`;
  let held = false;
  // Holding the connection while the model answers fails the commit of its answer.
  const answer =
    (instance: () => Instance): FauxResponseStep =>
    async () => {
      if (!held) {
        held = true;
        await instance().holdConnection(chatId);
      }
      return fauxAssistantMessage("Answered.");
    };
  const instance: Instance = startInstance(
    [answer(() => instance), answer(() => instance)],
    [],
  );
  try {
    const { first, end, second, live, entries } = await runTurn(
      instance,
      chatId,
    );
    expect(end).toMatchObject({ kind: "failed" });
    expect(String((end as { error?: unknown }).error)).toContain(
      "timeout exceeded when trying to connect",
    );
    // The stream ends with nothing committed, and no `finish`: the client reconnects.
    expect(first).toEqual([]);
    expect(second?.at(-1)).toEqual({ type: "finish", finishReason: "stop" });
    expect(live?.runFailure).toBeUndefined();
    // The answer the failed commit lost is asked for again; the transcript holds it once.
    expect(instance.modelRequests()).toBe(2);
    expect(entries.filter((entry) => AssistantEntry.is(entry))).toHaveLength(1);
  } finally {
    await instance.close();
    await dropSchema(chatId);
  }
});

test("a tool result's commit that gets no connection fails the Harness; a reopen answers the call as cut off and the turn ends once", async () => {
  const chatId = `pool-timeout-tool-${randomUUID()}`;
  let toolRuns = 0;
  let instance: Instance | undefined;
  const tool = defineTool({
    name: "work",
    description: "Works.",
    parameters: obj({}),
    execute: async () => {
      toolRuns += 1;
      if (toolRuns === 1) await instance?.holdConnection(chatId);
      return { output: [{ type: "text" as const, text: "done" }] };
    },
  });
  instance = startInstance(
    [
      fauxAssistantMessage(fauxToolCall("work", {}, { id: "work-1" }), {
        stopReason: "toolUse",
      }),
      fauxAssistantMessage("Worked."),
    ],
    [tool],
  );
  try {
    const { first, end, second, live, entries } = await runTurn(
      instance,
      chatId,
    );
    expect(end).toMatchObject({ kind: "failed" });
    expect(String((end as { error?: unknown }).error)).toContain(
      "timeout exceeded when trying to connect",
    );
    expect(first.map(({ type }) => type)).toEqual([
      "start",
      "start-step",
      "tool-input-available",
      "finish-step",
    ]);
    expect(second?.at(-1)).toEqual({ type: "finish", finishReason: "stop" });
    expect(live?.runFailure).toBeUndefined();
    // The tool ran once; its result was lost with the commit, and the reopen answers the call as cut off.
    expect(toolRuns).toBe(1);
    const results = entries.filter((entry) => ToolResultEntry.is(entry));
    expect(results).toHaveLength(1);
    const [result] = results;
    expect(result?.model?.[0]).toMatchObject({
      role: "toolResult",
      isError: true,
    });
    expect(entries.filter((entry) => AssistantEntry.is(entry))).toHaveLength(2);
    expect(instance.modelRequests()).toBe(2);
  } finally {
    await instance.close();
    await dropSchema(chatId);
  }
});
