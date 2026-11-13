/**
 * The server's limits across restarts, on the compose Postgres: model
 * request slots, whose waiting requests survive a restart and a crash, and
 * the crash-loop guard, which aborts work a crash keeps cutting off, as an
 * error the client and the transcript tell from a user's stop, but spares a
 * tool call waiting on a browser.
 *
 * A "crash" here is a second instance taking a conversation over while the
 * first still runs it: open counts every task the first was running as cut
 * off, as after a process kill.
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
  createRegistry,
  defineExtension,
  defineTool,
  LiveDoc,
} from "@earendil-works/pi-durable";
import { obj } from "@earendil-works/pi-schema";
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
  postgresConversationExists,
  postgresConversationStorage,
} from "../../src/server/conversation-storage";
import {
  createDurableAgentsServer,
  type CrashLoopingTask,
  type DurableAgentsServerLimits,
} from "../../src/server/durable-agents-server";
import {
  CrashLoopEntry,
  crashLoopErrorText,
} from "../../src/server/durable-agents-server/conversation-registry/crash-loop-guard";
import { postgresConfigFromEnvironment } from "../../src/storage/postgres/postgres-config";

const context = BACKGROUND_CONTEXT;
const poolConfig = postgresConfigFromEnvironment();
const admin = new Pool({ ...poolConfig, max: 1 });
const origin = "http://durable.test";
afterAll(() => admin.end());

/** A server tool that runs until it is aborted: a task a crash cuts off on every restart. */
const hangTool = defineTool({
  name: "hang",
  description: "Never answers.",
  parameters: obj({}),
  replay: "safe",
  execute: (_args, _api, toolContext) =>
    new Promise((_resolve, reject) => {
      toolContext.abortSignal?.addEventListener("abort", () =>
        reject(new Error("aborted")),
      );
    }),
});
const hangExtension = defineExtension({ name: "hang", tools: [hangTool] });

/** A model response that waits until its request is aborted: one that holds its slot. */
const neverAnswers: FauxResponseStep = (_context, options) =>
  new Promise((_resolve, reject) => {
    options?.signal?.addEventListener("abort", () =>
      reject(new Error("aborted")),
    );
  });

/** One server process: its own pool and model, the given limits, and what its guard reported. */
const startInstance = (
  responses: FauxResponseStep[],
  limits: Partial<DurableAgentsServerLimits>,
  // A crash while a request waits is a failed attempt; retry it promptly.
  retry: { readonly maxRetries?: number } = {},
) => {
  const pool = new Pool(poolConfig);
  const faux = fauxProvider();
  faux.setResponses(responses);
  const models = createModels();
  models.setProvider(faux.provider);
  const crashLoops: { conversationId: string; tasks: CrashLoopingTask[] }[] =
    [];
  const server = createDurableAgentsServer({
    openStorage: postgresConversationStorage(pool),
    storageExists: postgresConversationExists(pool),
    createRegistry: () => {
      const registry = createRegistry();
      registry.install(browserCallExtension);
      registry.install(hangExtension);
      return registry;
    },
    models,
    agent: {
      model: { provider: faux.provider.id, modelId: faux.getModel().id },
    },
    settings: { retry: { baseDelayMs: 10, ...retry } },
    clientToolNames: new Set([browserToolName]),
    limits,
    onCrashLoop: (conversationId, tasks) => {
      crashLoops.push({ conversationId, tasks: [...tasks] });
    },
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
    server,
    transport,
    crashLoops,
    modelRequests: () => faux.state.callCount,
    close: async () => {
      await server.close();
      await pool.end();
    },
  };
};

type Instance = ReturnType<typeof startInstance>;

const send = (instance: Instance, chatId: string, messageId = "user-1") =>
  instance.transport.sendMessages({
    trigger: "submit-message",
    chatId,
    messageId: undefined,
    messages: [
      { id: messageId, role: "user", parts: [{ type: "text", text: "Go." }] },
    ],
    abortSignal: undefined,
  });

/** Read a chunk stream to its end, keeping every chunk. */
const drain = async (stream: ReadableStream<UIMessageChunk>) => {
  const chunks: UIMessageChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
};

const textOf = (chunks: readonly UIMessageChunk[]) =>
  chunks
    .flatMap((chunk) => (chunk.type === "text-delta" ? [chunk.delta] : []))
    .join("");

const eventually = async <T>(
  probe: () => Promise<T | undefined>,
  timeoutMs = 10_000,
): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    // Each probe depends on time passing since the one before.
    // eslint-disable-next-line no-await-in-loop
    const value = await probe();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error("Timed out waiting.");
    // eslint-disable-next-line no-await-in-loop
    await sleep(20);
  }
};

const openConversation = async (instance: Instance, chatId: string) => {
  const conversation = await instance.server.conversations.acquire(chatId);
  if (conversation === undefined) throw new Error(`No conversation ${chatId}.`);
  return conversation;
};

const dropSchemas = (chatIds: readonly string[]) =>
  Promise.all(
    chatIds.map((chatId) =>
      admin.query(
        `DROP SCHEMA IF EXISTS "${conversationSchema(chatId)}" CASCADE`,
      ),
    ),
  );

/**
 * Three conversations on an instance with one request slot: the first
 * request takes it and never answers, the other two wait. Then `restart`
 * hands the conversations to a second instance, also with one slot, whose
 * model counts requests in flight. Every waiting request completes there,
 * one at a time.
 */
const waitingRequestsSurvive = async (
  restart: (first: Instance) => Promise<void>,
) => {
  const chatIds = Array.from(
    { length: 3 },
    (_, index) => `slots-${index}-${randomUUID()}`,
  );
  let active = 0;
  let peak = 0;
  const countedAnswer: FauxResponseStep = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await sleep(30);
    active -= 1;
    return fauxAssistantMessage("Answered after the restart.");
  };
  const first = startInstance([neverAnswers, neverAnswers, neverAnswers], {
    maxConcurrentRequests: 1,
  });
  const second = startInstance([countedAnswer, countedAnswer, countedAnswer], {
    maxConcurrentRequests: 1,
  });
  try {
    for (const chatId of chatIds) {
      // One at a time, so the first conversation is the one holding the slot.
      // eslint-disable-next-line no-await-in-loop
      void drain(await send(first, chatId)).catch(() => {});
      // eslint-disable-next-line no-await-in-loop
      await eventually(async () =>
        first.server.requestSlots.state().inFlight +
          first.server.requestSlots.state().waiting ===
        chatIds.indexOf(chatId) + 1
          ? true
          : undefined,
      );
    }
    expect(first.server.requestSlots.state()).toEqual({
      inFlight: 1,
      waiting: 2,
    });
    expect(first.modelRequests()).toBe(1);

    await restart(first);

    // The client reconnects each conversation; reopening resumes its run.
    const answers = await Promise.all(
      chatIds.map(async (chatId) => {
        const stream = await second.transport.reconnectToStream({ chatId });
        if (stream === null) throw new Error(`${chatId} is idle.`);
        return drain(stream);
      }),
    );
    for (const chunks of answers) {
      expect(textOf(chunks)).toBe("Answered after the restart.");
      expect(chunks.at(-1)).toEqual({ type: "finish", finishReason: "stop" });
    }
    expect(second.modelRequests()).toBe(3);
    expect(peak).toBe(1);
    expect(first.modelRequests()).toBe(1);
    expect(second.crashLoops).toEqual([]);
  } finally {
    await Promise.allSettled([first.close(), second.close()]);
    await dropSchemas(chatIds);
  }
};

test("requests waiting for a slot complete after a restart", async () => {
  await expect(
    waitingRequestsSurvive((first) => first.close()),
  ).resolves.toBeUndefined();
});

test("requests waiting for a slot complete after a crash", async () => {
  // The first instance keeps running; the second takes its conversations over.
  await expect(waitingRequestsSurvive(async () => {})).resolves.toBeUndefined();
});

test("a crash while a request waits for a slot charges its run a failed attempt", async () => {
  const chatIds = [`charged-0-${randomUUID()}`, `charged-1-${randomUUID()}`];
  const first = startInstance([neverAnswers, neverAnswers], {
    maxConcurrentRequests: 1,
  });
  // No retries: a charged attempt ends the run.
  const second = startInstance(
    [fauxAssistantMessage("Unreachable.")],
    { maxConcurrentRequests: 1 },
    { maxRetries: 0 },
  );
  try {
    for (const [index, chatId] of chatIds.entries()) {
      // eslint-disable-next-line no-await-in-loop
      void drain(await send(first, chatId)).catch(() => {});
      // eslint-disable-next-line no-await-in-loop
      await eventually(async () =>
        first.server.requestSlots.state().inFlight +
          first.server.requestSlots.state().waiting ===
        index + 1
          ? true
          : undefined,
      );
    }
    // The second conversation's request never reached the model: it waited for the slot.
    expect(first.server.requestSlots.state()).toEqual({
      inFlight: 1,
      waiting: 1,
    });
    expect(first.modelRequests()).toBe(1);

    const waited = await second.transport.reconnectToStream({
      chatId: chatIds[1]!,
    });
    const chunks = await drain(waited!);
    expect(chunks.at(-1)).toMatchObject({ type: "error" });
    const { harness, root } = await openConversation(second, chatIds[1]!);
    const live = await harness.snapshot(LiveDoc, root.id, context);
    expect(live?.runFailure?.reason).toBe("interrupted");
    expect(second.modelRequests()).toBe(0);
  } finally {
    await Promise.allSettled([first.close(), second.close()]);
    await dropSchemas(chatIds);
  }
});

test("the crash-loop guard aborts a task a crash cut off too often, visibly", async () => {
  const chatId = `crash-loop-${randomUUID()}`;
  const first = startInstance(
    [
      fauxAssistantMessage(fauxToolCall("hang", {}, { id: "hang-1" }), {
        stopReason: "toolUse",
      }),
    ],
    { crashLoopRestarts: 1 },
  );
  const second = startInstance([], { crashLoopRestarts: 1 });
  try {
    void drain(await send(first, chatId)).catch(() => {});
    // The tool task is running.
    await eventually(async () => {
      const { harness, root } = await openConversation(first, chatId);
      const live = await harness.snapshot(LiveDoc, root.id, context);
      return Object.keys(live?.tools ?? {}).length > 0 ? true : undefined;
    });

    // The second instance opens it: the tool task was cut off once, which reaches the lowered limit.
    // The client reconnecting to its turn sees it end in an error, not a stop.
    const reconnected = await second.transport.reconnectToStream({ chatId });
    expect(reconnected).not.toBeNull();
    const stopped = await drain(reconnected!);
    expect(stopped.map(({ type }) => type)).toContain("tool-input-available");
    expect(stopped.at(-1)).toEqual({
      type: "error",
      errorText: crashLoopErrorText,
    });
    expect(second.crashLoops).toEqual([
      {
        conversationId: chatId,
        tasks: [expect.objectContaining({ kind: "pi.tool", restarts: 1 })],
      },
    ]);
    // Only the first reconnect follows the ended turn; the conversation is idle.
    expect(await second.transport.reconnectToStream({ chatId })).toBeNull();
    const { harness, root } = await openConversation(second, chatId);
    const live = await harness.snapshot(LiveDoc, root.id, context);
    expect(live?.run).toBeUndefined();
    expect(live?.runFailure?.reason).toBe("aborted");
    // The transcript records why, for a later reader: the input it ended and the task it aborted for.
    const { items: entries } = await root.entries({}, 50, undefined, context);
    const records = entries.filter((entry) => CrashLoopEntry.is(entry));
    expect(records).toHaveLength(1);
    expect(records[0]?.data).toEqual({
      inputs: live?.runFailure?.inputs,
      tasks: [expect.objectContaining({ kind: "pi.tool", restarts: 1 })],
    });
    expect(records[0]?.model).toBeUndefined();
    // The client's retry of its message finds the run ended the same way.
    const retried = await drain(await send(second, chatId));
    expect(retried.at(-1)).toEqual({
      type: "error",
      errorText: crashLoopErrorText,
    });
    expect(second.modelRequests()).toBe(0);
  } finally {
    await Promise.allSettled([first.close(), second.close()]);
    await dropSchemas([chatId]);
  }
});

test("the crash-loop guard spares a tool call waiting on a browser", async () => {
  const chatId = `crash-loop-browser-${randomUUID()}`;
  const toolCallId = "call-1";
  const first = startInstance(
    [
      fauxAssistantMessage(
        fauxToolCall(browserToolName, { title: "Dryer" }, { id: toolCallId }),
        { stopReason: "toolUse" },
      ),
    ],
    { crashLoopRestarts: 1 },
  );
  const second = startInstance([fauxAssistantMessage("Renamed.")], {
    crashLoopRestarts: 1,
  });
  try {
    void drain(await send(first, chatId)).catch(() => {});
    await eventually(async () => {
      const { harness } = await openConversation(first, chatId);
      const { tasks } = await harness.inspect(context);
      return tasks.some(
        ({ record, state }) =>
          record.kind === "brunch.browser-call" && state.kind === "waiting",
      )
        ? true
        : undefined;
    });

    const reattached = await second.transport.reconnectToStream({ chatId });
    expect(reattached).not.toBeNull();
    expect(second.crashLoops).toEqual([]);
    const { harness, root } = await openConversation(second, chatId);
    const { tasks } = await harness.inspect(context);
    expect(
      tasks.find(({ record }) => record.kind === "pi.tool")?.record.restarts,
    ).toBe(1);

    const claim = await claimBrowserCall(harness, root.id, toolCallId, context);
    expect(claim).toBeDefined();
    await finishBrowserCall(
      harness,
      {
        conversationId: root.id,
        toolCallId,
        toolName: claim!.toolName,
        capability: claim!.capability,
        canonicalInput: claim!.input,
        output: { ok: true, title: "Dryer" },
      },
      context,
    );
    const chunks = await drain(reattached!);
    expect(textOf(chunks)).toBe("Renamed.");
    expect(chunks.at(-1)).toEqual({ type: "finish", finishReason: "stop" });
  } finally {
    await Promise.allSettled([first.close(), second.close()]);
    await dropSchemas([chatId]);
  }
});
