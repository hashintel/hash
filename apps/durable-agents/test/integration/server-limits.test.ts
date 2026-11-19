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
  type Harness,
  LiveDoc,
} from "@earendil-works/pi-durable";
import { obj } from "@earendil-works/pi-schema";
import {
  AbstractChat,
  type ChatState,
  DefaultChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { Pool } from "pg";
import { afterAll, expect, test, vi } from "vitest";

import {
  browserCallExtension,
  type BrowserCallResult,
  BrowserCallsDoc,
  browserToolName,
  claimBrowserCall,
  failBrowserCall,
  finishBrowserCall,
  recoverBrowserCallWakes,
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
} from "../../src/server/durable-agents-server/shared/crash-loop-entry";
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
      fauxAssistantMessage(
        [
          fauxToolCall("hang", {}, { id: "hang-1" }),
          fauxToolCall(
            browserToolName,
            { title: "Dryer" },
            { id: "browser-1" },
          ),
        ],
        { stopReason: "toolUse" },
      ),
    ],
    { crashLoopRestarts: 1 },
  );
  const second = startInstance([], { crashLoopRestarts: 1 });
  const reopened = startInstance([fauxAssistantMessage("A newer answer.")], {
    crashLoopRestarts: 1,
  });
  try {
    void drain(await send(first, chatId)).catch(() => {});
    // The tool task is running.
    await eventually(async () => {
      const { harness, root } = await openConversation(first, chatId);
      const call = (await harness.snapshot(BrowserCallsDoc, root.id, context))
        ?.calls["browser-1"];
      const { tasks } = await harness.inspect(context);
      return call?.status === "pending" &&
        tasks.filter(
          ({ record, state }) =>
            record.kind === "pi.tool" && state.kind === "running",
        ).length === 2
        ? true
        : undefined;
    });

    // The second instance opens it and records the abort. The first response never reaches a consumer.
    const lost = await second.transport.reconnectToStream({ chatId });
    expect(lost).not.toBeNull();
    await lost!.cancel();
    // Another reconnect to the same owner still observes that outcome.
    const reconnected = await second.transport.reconnectToStream({ chatId });
    expect(reconnected).not.toBeNull();
    const stopped = await drain(reconnected!);
    expect(stopped).toContainEqual(
      expect.objectContaining({
        type: "tool-input-available",
        toolCallId: "browser-1",
        providerExecuted: true,
      }),
    );
    expect(stopped.filter(({ type }) => type === "tool-output-error")).toEqual([
      expect.objectContaining({
        toolCallId: "hang-1",
        errorText: "Tool hang was aborted",
      }),
      expect.objectContaining({
        toolCallId: "browser-1",
        errorText: "Tool setNetTitle was aborted",
      }),
    ]);
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
    const originalStart = stopped.find((chunk) => chunk.type === "start");
    const messageId =
      originalStart?.type === "start" ? originalStart.messageId : undefined;
    expect(messageId).toBeDefined();
    // Reopening persisted state also replays it; drive the same reducer used by useChat.
    await second.close();
    const state: ChatState<UIMessage> = {
      messages: [
        { id: "user-1", role: "user", parts: [{ type: "text", text: "Go." }] },
      ],
      status: "ready",
      error: undefined,
      pushMessage: (message) => {
        state.messages.push(message);
      },
      popMessage: () => {
        state.messages.pop();
      },
      replaceMessage: (index, message) => {
        state.messages[index] = message;
      },
      snapshot: (value) => structuredClone(value),
    };
    const errors: string[] = [];
    const browserCalls: string[] = [];
    const chat = new (class extends AbstractChat<UIMessage> {})({
      id: chatId,
      state,
      transport: reopened.transport,
      onError: (error) => errors.push(error.message),
      onToolCall: ({ toolCall }) => {
        browserCalls.push(toolCall.toolCallId);
      },
    });
    await chat.resumeStream();
    await chat.resumeStream();
    expect(errors).toEqual([crashLoopErrorText, crashLoopErrorText]);
    expect(state.messages.map(({ id }) => id)).toEqual(["user-1", messageId]);
    expect(browserCalls).toEqual([]);
    expect(reopened.crashLoops).toEqual([]);
    const { harness, root } = await openConversation(reopened, chatId);
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
    const cleanup = entries.filter(
      (entry) => entry.model?.[0]?.role === "toolResult",
    );
    expect(cleanup).toHaveLength(2);
    expect(cleanup.every((entry) => entry.id > records[0]!.id)).toBe(true);
    // The follower of the settled submission projects the same ordered cleanup
    // and terminal reason. Only replay forces the browser tool input display-only.
    const retried = await drain(await send(reopened, chatId));
    const browserInput = (chunk: UIMessageChunk) =>
      chunk.type === "tool-input-available" &&
      chunk.toolName === browserToolName;
    expect(retried.find(browserInput)).toMatchObject({
      toolCallId: "browser-1",
    });
    expect(stopped.filter((chunk) => !browserInput(chunk))).toEqual(
      retried.filter((chunk) => !browserInput(chunk)),
    );
    expect(reopened.modelRequests()).toBe(0);
    const newer = await drain(await send(reopened, chatId, "user-2"));
    expect(textOf(newer)).toBe("A newer answer.");
    expect(await reopened.transport.reconnectToStream({ chatId })).toBeNull();
    expect(reopened.modelRequests()).toBe(1);
  } finally {
    await Promise.allSettled([first.close(), second.close(), reopened.close()]);
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

type Opened = Awaited<ReturnType<typeof openConversation>>;

/** The browser-answer tests' crash-loop limit: one restart after the answer is not a loop. */
const answeredLimit = 3;

/** The one browser call each browser-answer test issues. */
const answeredCallId = "call-1";

/** What the claim's holder sends with an outcome. */
type ClaimProof = Omit<BrowserCallResult, "output" | "metadata">;

/** A browser call's outcomes as the browser commits them: the call's status after it, and what a retry returns. */
const browserOutcomes = {
  finish: {
    status: "finished",
    retried: "settled",
    commit: (harness: Harness, proof: ClaimProof) =>
      finishBrowserCall(
        harness,
        { ...proof, output: { ok: true, title: "Dryer" } },
        context,
      ),
  },
  fail: {
    status: "failed",
    retried: "failed",
    commit: (harness: Harness, proof: ClaimProof) =>
      failBrowserCall(harness, { ...proof, disposition: "failed" }, context),
  },
} as const;

type BrowserOutcome = keyof typeof browserOutcomes;

const answeredCall = async ({ harness, root }: Opened) =>
  (await harness.snapshot(BrowserCallsDoc, root.id, context))?.calls[
    answeredCallId
  ];

const answeredToolResults = async ({ root }: Opened) => {
  const { items } = await root.entries(
    { order: "ascending" },
    100,
    undefined,
    context,
  );
  return items.filter((entry) =>
    entry.model?.some(
      (message) =>
        message.role === "toolResult" && message.toolCallId === answeredCallId,
    ),
  );
};

/** Instances that take one conversation over in turn, each with the crash-loop limit at `answeredLimit`. */
const takeovers = () => {
  const instances: Instance[] = [];
  return {
    start: (responses: FauxResponseStep[] = []) => {
      const instance = startInstance(responses, {
        crashLoopRestarts: answeredLimit,
      });
      instances.push(instance);
      return instance;
    },
    close: () =>
      Promise.allSettled(instances.map((instance) => instance.close())),
  };
};

/**
 * Issue the browser call, take the conversation over `waitingRestarts`
 * times while it waits, then commit the browser's `outcome`. The owner dies
 * after that commit, before it rings the doorbell, so the call stays
 * answered and its tool call open.
 */
const answerAfterWaiting = async (
  start: ReturnType<typeof takeovers>["start"],
  chatId: string,
  waitingRestarts: number,
  outcome: BrowserOutcome,
) => {
  // Each takeover must find the tool call still waiting on an unanswered browser, and spare it.
  const waitingOnBrowser = (instance: Instance, expectedRestarts: number) =>
    eventually(async () => {
      const opened = await openConversation(instance, chatId);
      const { tasks } = await opened.harness.inspect(context);
      const tool = tasks.find(({ record }) => record.kind === "pi.tool");
      const browser = tasks.find(
        ({ record }) => record.kind === "brunch.browser-call",
      );
      if (tool?.state.kind !== "running" || browser?.state.kind !== "waiting")
        return undefined;
      expect(tool.record.restarts ?? 0).toBe(expectedRestarts);
      expect((await answeredCall(opened))?.status).toBe("pending");
      expect(instance.crashLoops).toEqual([]);
      return { opened, tool: tool.record.id };
    });
  const first = start([
    fauxAssistantMessage(
      fauxToolCall(browserToolName, { title: "Dryer" }, { id: answeredCallId }),
      { stopReason: "toolUse" },
    ),
  ]);
  void drain(await send(first, chatId)).catch(() => {});
  let waiting = await waitingOnBrowser(first, 0);
  for (let restart = 0; restart < waitingRestarts; restart++) {
    // Each takeover waits for the one before.
    // eslint-disable-next-line no-await-in-loop
    waiting = await waitingOnBrowser(start(), restart + 1);
  }
  const { opened, tool } = waiting;

  const claim = await claimBrowserCall(
    opened.harness,
    opened.root.id,
    answeredCallId,
    context,
  );
  if (claim === undefined) throw new Error("The call was not claimable.");
  const proof: ClaimProof = {
    conversationId: opened.root.id,
    toolCallId: answeredCallId,
    toolName: claim.toolName,
    capability: claim.capability,
    canonicalInput: claim.input,
  };
  const ring = vi
    .spyOn(opened.harness, "abortTask")
    .mockRejectedValue(new Error("Interrupted before the ring."));
  expect(await browserOutcomes[outcome].commit(opened.harness, proof)).toBe(
    browserOutcomes[outcome].retried,
  );
  expect(ring).toHaveBeenCalled();
  const call = await answeredCall(opened);
  expect(call?.status).toBe(browserOutcomes[outcome].status);
  // Every restart the tool call had when the outcome committed was a wait.
  expect(call?.ownerAtOutcome).toEqual({
    task: tool,
    restarts: waitingRestarts,
  });
  expect(await answeredToolResults(opened)).toEqual([]);
  return { opened, ring };
};

test.each([
  ["finish", 0],
  ["finish", 3],
  ["fail", 0],
  ["fail", 3],
] as const)(
  "a browser %s does not turn %i earlier waiting restarts into a crash loop",
  async (outcome, waitingRestarts) => {
    const chatId = `crash-loop-answered-${randomUUID()}`;
    const { start, close } = takeovers();
    try {
      const { opened, ring } = await answerAfterWaiting(
        start,
        chatId,
        waitingRestarts,
        outcome,
      );

      // One interruption after the answer, below the limit.
      const newerStarted = Promise.withResolvers<void>();
      const answerNewer = Promise.withResolvers<void>();
      const replacement = start([
        fauxAssistantMessage("Renamed."),
        async () => {
          newerStarted.resolve();
          await answerNewer.promise;
          return fauxAssistantMessage("A newer answer.");
        },
      ]);
      const conversations = replacement.server.conversations;
      const acquire = conversations.acquire;
      const settled = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      // Hold only the opening reconnect after ownership/recovery, until the real
      // resumed run has committed its answer. No timing assumptions about the stub.
      vi.spyOn(conversations, "acquire").mockImplementationOnce(
        async (...args) => {
          try {
            const conversation = await acquire(...args);
            await conversation?.root.waitForIdle(context);
            settled.resolve();
            await release.promise;
            return conversation;
          } catch (error) {
            settled.reject(error);
            throw error;
          }
        },
      );
      const reconnect = replacement.transport.reconnectToStream({ chatId });
      await settled.promise;
      try {
        // Another reconnect to the now-idle owner gets no replay, even while
        // the original request is still in flight.
        expect(
          await replacement.transport.reconnectToStream({ chatId }),
        ).toBeNull();
        const newer = await send(replacement, chatId, "user-2");
        await newerStarted.promise;
        const followedNewer = await replacement.transport.reconnectToStream({
          chatId,
        });
        answerNewer.resolve();
        expect(textOf(await drain(followedNewer!))).toBe("A newer answer.");
        await drain(newer);
      } finally {
        answerNewer.resolve();
        release.resolve();
      }
      const stream = await reconnect;
      expect(stream).not.toBeNull();
      expect(replacement.crashLoops).toEqual([]);
      // No browser retry: reopening recovers the original committed answer.
      const recovered = await openConversation(replacement, chatId);
      ring.mockRestore();
      await expect(
        recoverBrowserCallWakes(opened.harness, opened.root.id, context),
      ).rejects.toThrow(/owned by a storage opened later|session/i);
      await recoverBrowserCallWakes(
        recovered.harness,
        recovered.root.id,
        context,
      );
      const chunks = await drain(stream!);
      expect(textOf(chunks)).toBe("Renamed.");
      expect(chunks.at(-1)).toEqual({ type: "finish", finishReason: "stop" });
      expect(await answeredToolResults(recovered)).toHaveLength(1);
    } finally {
      await close();
      await dropSchemas([chatId]);
    }
  },
);

test("a browser answer recorded without its tool call's restart count charges every restart", async () => {
  const chatId = `crash-loop-answered-unrecorded-${randomUUID()}`;
  const { start, close } = takeovers();
  try {
    const { opened } = await answerAfterWaiting(
      start,
      chatId,
      answeredLimit,
      "finish",
    );
    // As a call answered before the count was recorded.
    await opened.harness.commit(async (tx) => {
      const call = (await tx.doc(BrowserCallsDoc, opened.root.id)).calls[
        answeredCallId
      ];
      if (call !== undefined) delete call.ownerAtOutcome;
    }, context);

    const replacement = start();
    await openConversation(replacement, chatId);
    expect(replacement.crashLoops).toEqual([
      {
        conversationId: chatId,
        tasks: [
          expect.objectContaining({
            kind: "pi.tool",
            restarts: answeredLimit + 1,
          }),
        ],
      },
    ]);
  } finally {
    await close();
    await dropSchemas([chatId]);
  }
});
