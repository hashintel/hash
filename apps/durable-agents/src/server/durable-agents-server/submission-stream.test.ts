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
  type EntryId,
  type Extension,
  type Harness,
  MemoryStorage,
  type Submission,
} from "@earendil-works/pi-durable";
import { obj } from "@earendil-works/pi-schema";
import {
  type ChatTransport,
  DefaultChatTransport,
  readUIMessageStream,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { afterEach, expect, test } from "vitest";

import {
  fauxAssistantMessage,
  fauxToolCall,
} from "../../../test/scripted-model";
import {
  pruneEntryKind,
  pruneRequestId,
} from "../../agent/hash-agent/read-back-pruning";
import {
  browserCallExtension,
  browserToolName,
} from "../../browser-call/browser-call";
import {
  createDurableAgentsServer,
  type DurableAgentsServerLimits,
  type DurableAgentsServerOptions,
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
  readonly afterBind?: DurableAgentsServerOptions["afterBind"];
};

/** A server on in-memory storage with a scripted model, and AI SDK's own client calling it in-process. */
const openChat = ({
  responses,
  extensions = [],
  limits,
  afterBind,
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
    agent: {
      model: { provider: faux.provider.id, modelId: faux.getModel().id },
    },
    settings: { progress: { partialIntervalMs: 5, outputIntervalMs: 5 } },
    clientToolNames: new Set([browserToolName]),
    limits,
    afterBind,
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

/** The message AI SDK's own reducer builds from `chunks`. */
const reduce = async (chunks: readonly UIMessageChunk[]) => {
  let message: UIMessage | undefined;
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  for await (const next of readUIMessageStream({ stream })) message = next;
  return message;
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

/** A server tool that answers once `release` resolves, or fails once aborted, telling `reached` when it starts. */
const holdTool = (
  reached: PromiseWithResolvers<void>,
  release: Promise<void>,
) =>
  defineTool({
    name: "hold",
    description: "Answers when released.",
    parameters: obj({}),
    execute: async (_args, _api, callContext) => {
      reached.resolve();
      const aborted = Promise.withResolvers<never>();
      callContext.abortSignal?.addEventListener(
        "abort",
        () => aborted.reject(new Error("Aborted.")),
        { once: true },
      );
      await Promise.race([release, aborted.promise]);
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

/**
 * Count each `status()` read of a submission handle the Harness gives out.
 * Storage is the wrong place to count: the Session answers them from its
 * cache, but each is still a job on its mutation line.
 */
const countStatusReads = () => {
  const reads = { count: 0 };
  const afterBind: ChatOptions["afterBind"] = async ({ harness }) => {
    const handleOf = harness.submission.bind(harness);
    Object.assign(harness, {
      submission: async (...args: Parameters<Harness["submission"]>) => {
        const handle = await handleOf(...args);
        if (handle === undefined) return handle;
        const status = handle.status.bind(handle);
        return Object.assign(handle, {
          status: (...statusArgs: Parameters<Submission["status"]>) => {
            reads.count += 1;
            return status(...statusArgs);
          },
        });
      },
    });
  };
  return { reads, afterBind };
};

test("a streamed turn reads its submission's record a bounded number of times, not once per view", async () => {
  const answer = "A long answer, streamed in many partials. ".repeat(60);
  const { reads, afterBind } = countStatusReads();
  const { transport } = openChat({
    responses: [fauxAssistantMessage(answer)],
    afterBind,
  });
  const chunks = await drain(
    await send(transport, userMessage("user-reads")),
    "the stream",
  );
  expect(textOf(chunks)).toBe(answer);
  // Each partial is its own view.
  expect(
    chunks.filter(({ type }) => type === "text-delta").length,
  ).toBeGreaterThan(20);
  // Once as the stream starts, once when the view shows the run settled it.
  expect(reads.count).toBeLessThanOrEqual(2);
});

/** A server tool that writes output until its call is aborted. */
const tickerTool = defineTool({
  name: "ticker",
  description: "Ticks until stopped.",
  parameters: obj({}),
  execute: async (_args, api, callContext) => {
    for (;;) {
      api.output("tick\n");
      // Each tick waits for the one before.
      // eslint-disable-next-line no-await-in-loop
      await sleep(2, undefined, { signal: callContext.abortSignal });
    }
  },
});

/** Each tool call's outcome in `message`: its state, and its error text when it failed. */
const toolOutcomes = (message: UIMessage | undefined) =>
  Object.fromEntries(
    (message?.parts ?? []).flatMap((part) =>
      "toolCallId" in part && "state" in part
        ? [
            [
              part.toolCallId,
              {
                state: part.state,
                errorText: "errorText" in part ? part.errorText : undefined,
              },
            ],
          ]
        : [],
    ),
  );

test("a stop during running tool calls streams the error results history shows", async () => {
  const { server, transport } = openChat({
    responses: [
      fauxAssistantMessage(
        [
          fauxToolCall("ticker", {}, { id: "tick-1" }),
          fauxToolCall("ticker", {}, { id: "tick-2" }),
        ],
        { stopReason: "toolUse" },
      ),
    ],
    extensions: [defineExtension({ name: "test.tools", tools: [tickerTool] })],
  });
  const stream = drain(
    await send(transport, userMessage("user-stop")),
    "the stream",
  );
  await sleep(100);
  const stopped = await server.app.request(`${origin}/chat/${chatId}/abort`, {
    method: "POST",
  });
  expect(stopped.status).toBe(204);
  const chunks = await stream;
  expect(chunks.at(-1)).toEqual({
    type: "abort",
    reason: "The chat turn aborted.",
  });

  const history = await server.app.request(`${origin}/chat/${chatId}/messages`);
  const messages = (await history.json()) as UIMessage[];
  const shown = toolOutcomes(messages.at(-1));
  expect(Object.keys(shown)).toEqual(["tick-1", "tick-2"]);
  expect(toolOutcomes(await reduce(chunks))).toEqual(shown);
});

test.each([
  ["within one window", 2],
  // Each round is two entries, so more than 100 follow the stopped turn.
  ["past a window, read page by page", 60],
])(
  "a stopped turn resent after a later turn %s streams only its own entries and ends with its abort",
  async (_, rounds) => {
    const reached = Promise.withResolvers<void>();
    const pings = Array.from(
      { length: rounds },
      (__, round) => `ping-${round}`,
    );
    const { server, transport } = openChat({
      responses: [
        toolRound("hold", "hold"),
        ...pings.map((id) => toolRound("ping", id)),
        fauxAssistantMessage("Later."),
      ],
      extensions: [
        defineExtension({
          name: "test.tools",
          // Never released: the stop ends it.
          tools: [pingTool, holdTool(reached, new Promise(() => {}))],
        }),
      ],
    });
    const message = userMessage("user-stopped");
    const first = drain(await send(transport, message), "the stopped stream");
    await within("the run to reach its hold", reached.promise);
    const stopped = await server.app.request(`${origin}/chat/${chatId}/abort`, {
      method: "POST",
    });
    expect(stopped.status).toBe(204);
    const followed = await first;

    const later = await drain(
      await send(transport, userMessage("user-later")),
      "the later stream",
    );
    expect(toolInputIds(later)).toEqual(pings);
    expect(textOf(later)).toBe("Later.");

    const resent = await drain(
      await send(transport, message),
      "the resent stream",
    );
    expect(toolInputIds(resent)).toEqual(["hold"]);
    expect(textOf(resent)).toBe("");
    expect(resent).toEqual(followed);
    expect(resent.at(-1)).toEqual({
      type: "abort",
      reason: "The chat turn aborted.",
    });
  },
);

test("a follow-up withdrawn while queued ends its stream, though it never reached the run", async () => {
  const reached = Promise.withResolvers<void>();
  const { server, transport } = openChat({
    responses: [toolRound("hold", "hold")],
    extensions: [
      defineExtension({
        name: "test.tools",
        // Never released: the stop ends it.
        tools: [holdTool(reached, new Promise(() => {}))],
      }),
    ],
  });
  const first = drain(
    await send(transport, userMessage("user-first")),
    "the first stream",
  );
  await within("the run to reach its hold", reached.promise);
  const queued = drain(
    await send(transport, userMessage("user-queued")),
    "the queued stream",
  );

  const stopped = await server.app.request(`${origin}/chat/${chatId}/abort`, {
    method: "POST",
  });
  expect(stopped.status).toBe(204);
  expect(await queued).toEqual([
    { type: "abort", reason: "The chat turn aborted." },
  ]);
  expect((await first).at(-1)).toEqual({
    type: "abort",
    reason: "The chat turn aborted.",
  });
});

test("a follow-up queued behind a run that fails ends its stream with an error", async () => {
  const reached = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const { transport, faux } = openChat({
    responses: [toolRound("hold", "hold")],
    extensions: [
      defineExtension({
        name: "test.tools",
        tools: [holdTool(reached, release.promise)],
      }),
    ],
    // The first tool round fails the run.
    limits: { maxTurns: 1 },
  });
  const first = drain(
    await send(transport, userMessage("user-failing")),
    "the failing stream",
  );
  await within("the run to reach its hold", reached.promise);
  const queued = drain(
    await send(transport, userMessage("user-behind")),
    "the queued stream",
  );
  release.resolve();

  const failed = (await first).at(-1);
  expect(failed?.type === "error" ? failed.errorText : failed).toContain(
    "1 turn",
  );
  expect(await queued).toEqual([{ type: "error", errorText: "run_failed" }]);
  expect(faux.state.callCount).toBe(1);
});

test("a chat whose message ID is a write's request ID is refused, not followed", async () => {
  const { server, transport } = openChat({
    responses: [fauxAssistantMessage("Answered.")],
  });
  await drain(
    await send(transport, userMessage("user-first")),
    "the first stream",
  );
  const conversation = await server.conversations.acquire(chatId);
  if (conversation === undefined) throw new Error("No conversation.");
  const requestId = pruneRequestId(1 as EntryId);
  await conversation.root.submit(
    {
      type: "write",
      requestId,
      entry: { kind: pruneEntryKind, data: { assistant: 1 }, edits: [] },
    },
    context,
  );

  const response = await server.app.request(`${origin}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: chatId,
      messages: [userMessage(requestId)],
      trigger: "submit-message",
    }),
  });
  await response.body?.cancel();
  expect(response.status).toBe(409);
});
