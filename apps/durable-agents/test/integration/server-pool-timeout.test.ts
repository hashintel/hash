/**
 * The server on a saturated Postgres pool, on the compose Postgres: a pool of
 * one connection with a short wait, whose connection the test holds.
 *
 * - An HTTP request that cannot get a connection in time is answered 503
 *   with `Retry-After`, on every route.
 * - A durable commit inside a running turn (a model step, a tool result)
 *   that gets a connection within the storage's retry window is stored on a
 *   retry: the turn finishes and its Harness stays open.
 * - One that gets none within the window fails its Harness: Pi Durable
 *   retries nothing itself, and the run is not marked failed. The client's
 *   stream ends without a `finish`, and a request while the pool is still
 *   exhausted is answered 503. The next request after reopens the
 *   conversation, which resumes the run from its last commit. What was not
 *   committed is redone (the model request) or answered as cut off (the tool
 *   call), and the turn ends with one answer. The failure is reported with
 *   its conversation.
 */
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
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
  type Report,
  ToolResultEntry,
} from "@earendil-works/pi-durable";
import { obj } from "@earendil-works/pi-schema";
import { DefaultChatTransport, type UIMessage, type UIMessageChunk } from "ai";
import { Pool, type PoolClient } from "pg";
import { afterAll, expect, test } from "vitest";

import {
  conversationSchema,
  postgresConversationExists,
} from "../../src/server/conversation-storage";
import { createDurableAgentsServer } from "../../src/server/durable-agents-server";
import {
  browserCallsPrefix,
  startDurableAgentsServer,
} from "../../src/server/start-durable-agents-server";
import {
  isPoolConnectTimeout,
  postgresConfigFromEnvironment,
} from "../../src/storage/postgres/postgres-config";
import { openPostgresStorage } from "../../src/storage/postgres/postgres-storage";
import { scriptedModel } from "../scripted-model";

const context = BACKGROUND_CONTEXT;
const poolConfig = postgresConfigFromEnvironment();
const admin = new Pool({ ...poolConfig, max: 1 });
afterAll(() => admin.end());

/** Long enough for a new connection to the compose Postgres; a held one is never freed within it. */
const waitMs = 1000;
/** Within the storage's default retry window: a commit waiting on it is retried and stored. */
const briefHoldMs = 3000;
/** The retry window of the instances whose commits outlast it. */
const shortRetryMs = 1500;
/**
 * Past the commit's first pool wait, `shortRetryMs` and its last pool wait, and long enough for one more request to
 * wait out the pool.
 */
const longHoldMs = waitMs + shortRetryMs + 2 * waitMs + 500;

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

test("the production server reports a Harness failed by a commit without a connection, with its conversation", async () => {
  const chatId = `pool-report-${randomUUID()}`;
  const pool = new Pool({
    ...poolConfig,
    max: 1,
    connectionTimeoutMillis: waitMs,
  });
  let held: PoolClient | undefined;
  // Holding the connection while the model answers fails the commit of its answer.
  const { models, model } = scriptedModel([
    async () => {
      held = await pool.connect();
      return fauxAssistantMessage("Answered.");
    },
  ]);
  const reports: (readonly [string, Report["kind"]])[] = [];
  const server = await startDurableAgentsServer({
    port: 0,
    hostname: "127.0.0.1",
    pool,
    models,
    model,
    onReport: (conversationId, { kind }) => {
      reports.push([conversationId, kind]);
    },
  });
  try {
    // The stream breaks off before its first chunk, which drops the connection.
    const body = await fetch(`http://127.0.0.1:${server.port}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        trigger: "submit-message",
        messages: [
          {
            id: "user-1",
            role: "user",
            parts: [{ type: "text", text: "Hi." }],
          },
        ],
        binding: { conversationId: chatId, documentId: `net-${randomUUID()}` },
      }),
    })
      .then((response) => response.text())
      .catch(() => "");
    expect(body).not.toContain('"type":"finish"');
    // The report comes once the Session is sealed, as the stream ends.
    for (let attempt = 0; attempt < 50 && reports.length === 0; attempt++) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(20);
    }
    expect(reports.filter(([, kind]) => kind === "storage_failed")).toEqual([
      [chatId, "storage_failed"],
    ]);
  } finally {
    held?.release();
    await server.close();
    await pool.end();
    await dropSchema(chatId);
  }
});

/**
 * A server on a one-connection pool with the faux model's `responses` and `tools`, whose storage retries for
 * `transientRetryMs`, by default the storage's own default.
 */
const startInstance = (
  responses: FauxResponseStep[],
  tools: readonly ReturnType<typeof defineTool>[],
  { transientRetryMs }: { transientRetryMs?: number } = {},
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
    openStorage: (conversationId) =>
      openPostgresStorage({
        pool,
        schema: conversationSchema(conversationId),
        transientRetryMs,
      }),
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
    isUnavailable: isPoolConnectTimeout,
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
  /** The end of each Harness that was open when the test took the connection away from it. */
  const harnessEnds: Promise<SessionEnd>[] = [];
  const releases: Promise<void>[] = [];
  /** Hold the pool's only connection for `holdFor`, from inside the running turn. */
  const holdConnection = async (chatId: string, holdFor: number) => {
    const open = await server.conversations.ifOwned(chatId);
    if (open !== undefined) harnessEnds.push(open.harness.closed);
    const client = await pool.connect();
    releases.push(sleep(holdFor).then(() => client.release()));
  };
  return {
    server,
    transport,
    holdConnection,
    harnessEnds,
    released: () => Promise.all(releases),
    modelRequests: () => faux.state.callCount,
    close: async () => {
      await server.close();
      await pool.end();
    },
  };
};

type Instance = ReturnType<typeof startInstance>;

/** Send one message and read its stream until it ends or breaks off. */
const sendTurn = async (instance: Instance, chatId: string) => {
  const started = performance.now();
  const stream = await instance.transport.sendMessages({
    trigger: "submit-message",
    chatId,
    messageId: undefined,
    messages: [
      { id: "user-1", role: "user", parts: [{ type: "text", text: "Go." }] },
    ],
    abortSignal: undefined,
  });
  const first: UIMessageChunk[] = [];
  let interruption: unknown;
  try {
    for await (const chunk of stream) first.push(chunk);
  } catch (error) {
    interruption = error;
  }
  return { first, interruption, elapsedMs: performance.now() - started };
};

/** The conversation once its run is idle: its run state and transcript. */
const settledConversation = async (instance: Instance, chatId: string) => {
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
  return { live, entries };
};

/** Whether `end` is still pending: its Harness has not closed. */
const stillOpen = (end: Promise<SessionEnd> | undefined) =>
  Promise.race([end?.then(() => false), sleep(0).then(() => true)]);

/**
 * Send one message whose commit fails its Harness; ask for its stream while the connection is still held; once it is
 * free, reconnect and let the turn finish.
 */
const runFailedTurn = async (instance: Instance, chatId: string) => {
  const { first, interruption } = await sendTurn(instance, chatId);
  const end = await instance.harnessEnds.at(0);
  const duringHold = await instance.server.app.request(
    `http://durable.test/chat/${chatId}/stream`,
  );
  await instance.released();
  // Any request reopens the failed conversation, which resumes its run.
  const reconnected = await instance.transport.reconnectToStream({ chatId });
  const second = reconnected === null ? null : await drain(reconnected);
  return {
    first,
    interruption,
    end,
    duringHold,
    second,
    ...(await settledConversation(instance, chatId)),
  };
};

test("a model step's commit that waits out a brief pool exhaustion is stored on a retry; the turn finishes on its Harness", async () => {
  const chatId = `pool-brief-model-${randomUUID()}`;
  let held = false;
  let instance: Instance | undefined;
  instance = startInstance(
    [
      async () => {
        if (!held) {
          held = true;
          await instance?.holdConnection(chatId, briefHoldMs);
        }
        return fauxAssistantMessage("Answered.");
      },
    ],
    [],
  );
  try {
    const { first, interruption, elapsedMs } = await sendTurn(instance, chatId);
    expect(interruption).toBeUndefined();
    expect(first.at(-1)).toEqual({ type: "finish", finishReason: "stop" });
    // The answer's commit could land only once the connection was free.
    expect(elapsedMs).toBeGreaterThanOrEqual(briefHoldMs - 100);
    expect(await stillOpen(instance.harnessEnds.at(0))).toBe(true);
    const { live, entries } = await settledConversation(instance, chatId);
    expect(live?.runFailure).toBeUndefined();
    expect(instance.modelRequests()).toBe(1);
    expect(entries.filter((entry) => AssistantEntry.is(entry))).toHaveLength(1);
  } finally {
    await instance.released();
    await instance.close();
    await dropSchema(chatId);
  }
});

test("a tool result's commit that waits out a brief pool exhaustion is stored on a retry; the turn finishes on its Harness", async () => {
  const chatId = `pool-brief-tool-${randomUUID()}`;
  let toolRuns = 0;
  let instance: Instance | undefined;
  const tool = defineTool({
    name: "work",
    description: "Works.",
    parameters: obj({}),
    execute: async () => {
      toolRuns += 1;
      if (toolRuns === 1) await instance?.holdConnection(chatId, briefHoldMs);
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
    const { first, interruption, elapsedMs } = await sendTurn(instance, chatId);
    expect(interruption).toBeUndefined();
    expect(first.at(-1)).toEqual({ type: "finish", finishReason: "stop" });
    expect(elapsedMs).toBeGreaterThanOrEqual(briefHoldMs - 100);
    expect(await stillOpen(instance.harnessEnds.at(0))).toBe(true);
    const { live, entries } = await settledConversation(instance, chatId);
    expect(live?.runFailure).toBeUndefined();
    expect(toolRuns).toBe(1);
    const results = entries.filter((entry) => ToolResultEntry.is(entry));
    expect(results.map((result) => result.model?.[0])).toMatchObject([
      { role: "toolResult", isError: false },
    ]);
    expect(instance.modelRequests()).toBe(2);
  } finally {
    await instance.released();
    await instance.close();
    await dropSchema(chatId);
  }
});

test("a model step's commit that gets no connection within the retry window fails the Harness; a request meanwhile is a 503, and a reopen asks the model again and answers once", async () => {
  const chatId = `pool-timeout-model-${randomUUID()}`;
  let held = false;
  // Holding the connection while the model answers fails the commit of its answer.
  const answer =
    (instance: () => Instance): FauxResponseStep =>
    async () => {
      if (!held) {
        held = true;
        await instance().holdConnection(chatId, longHoldMs);
      }
      return fauxAssistantMessage("Answered.");
    };
  const instance: Instance = startInstance(
    [answer(() => instance), answer(() => instance)],
    [],
    { transientRetryMs: shortRetryMs },
  );
  try {
    const { first, interruption, end, duringHold, second, live, entries } =
      await runFailedTurn(instance, chatId);
    expect(duringHold.status).toBe(503);
    expect(duringHold.headers.get("retry-after")).toBe("1");
    expect(end).toMatchObject({ kind: "failed" });
    expect(String((end as { error?: unknown }).error)).toContain(
      "timeout exceeded when trying to connect",
    );
    expect(String(interruption)).toContain(
      "chat stream ended before the turn settled",
    );
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

test("a tool result's commit that gets no connection within the retry window fails the Harness; a reopen answers the call as cut off and the turn ends once", async () => {
  const chatId = `pool-timeout-tool-${randomUUID()}`;
  let toolRuns = 0;
  let instance: Instance | undefined;
  const tool = defineTool({
    name: "work",
    description: "Works.",
    parameters: obj({}),
    execute: async () => {
      toolRuns += 1;
      if (toolRuns === 1) await instance?.holdConnection(chatId, longHoldMs);
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
    { transientRetryMs: shortRetryMs },
  );
  try {
    const { first, interruption, end, duringHold, second, live, entries } =
      await runFailedTurn(instance, chatId);
    expect(duringHold.status).toBe(503);
    expect(end).toMatchObject({ kind: "failed" });
    expect(String((end as { error?: unknown }).error)).toContain(
      "timeout exceeded when trying to connect",
    );
    expect(String(interruption)).toContain(
      "chat stream ended before the turn settled",
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

test("a request right after a commit fails the Harness, while its close still waits on a tool, is served by a fresh Harness", async () => {
  const chatId = `pool-timeout-closing-${randomUUID()}`;
  /** Outlasts the failed commit's retries, so the next request gets the connection soon after the failure. */
  const holdFor = waitMs + shortRetryMs + waitMs + 200;
  /** Keeps the failed Harness's `closed` pending well past the next request. */
  const lingerMs = holdFor + 3000;
  let workRuns = 0;
  let instance: Instance | undefined;
  const work = defineTool({
    name: "work",
    description: "Works.",
    parameters: obj({}),
    execute: async () => {
      workRuns += 1;
      if (workRuns === 1) await instance?.holdConnection(chatId, holdFor);
      return { output: [{ type: "text" as const, text: "done" }] };
    },
  });
  const linger = defineTool({
    name: "linger",
    description: "Lingers, ignoring its abort signal.",
    parameters: obj({}),
    execute: async () => {
      await sleep(lingerMs);
      return { output: [{ type: "text" as const, text: "lingered" }] };
    },
  });
  instance = startInstance(
    [
      fauxAssistantMessage(
        [
          fauxToolCall("work", {}, { id: "work-1" }),
          fauxToolCall("linger", {}, { id: "linger-1" }),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage("Worked."),
    ],
    [work, linger],
    { transientRetryMs: shortRetryMs },
  );
  try {
    const stream = await instance.transport.sendMessages({
      trigger: "submit-message",
      chatId,
      messageId: undefined,
      messages: [
        { id: "user-1", role: "user", parts: [{ type: "text", text: "Go." }] },
      ],
      abortSignal: undefined,
    });
    await expect(drain(stream)).rejects.toThrow(
      "chat stream ended before the turn settled",
    );
    const [failedEnd] = instance.harnessEnds;
    let failedClosed = false;
    void failedEnd?.then(() => {
      failedClosed = true;
    });

    // The failed Harness is closing, not closed: the next request must not get it.
    const next = await instance.server.app.request(
      `http://durable.test/chat/${chatId}/stream`,
    );
    expect(failedClosed).toBe(false);
    expect(next.status).toBe(200);
    const body = await next.text();
    expect(body).toContain("Worked.");
    expect(body).toContain('"type":"finish"');

    expect(await failedEnd).toMatchObject({ kind: "failed" });
    expect(workRuns).toBe(1);
  } finally {
    await instance.close();
    await dropSchema(chatId);
  }
});
