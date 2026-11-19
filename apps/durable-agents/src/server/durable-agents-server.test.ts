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
  LiveDoc,
  MemoryStorage,
  type Report,
  section,
} from "@earendil-works/pi-durable";
import { obj } from "@earendil-works/pi-schema";
import {
  type ChatTransport,
  DefaultChatTransport,
  readUIMessageStream,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { Hono } from "hono";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  petrinautContextualUserMessageBody,
  versionLoadSectionText,
} from "@hashintel/brunch-agent";

import { holdTool, textOf } from "../../test/platform/support";
import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../../test/scripted-model";
import {
  versionLoadSectionExtension,
  versionLoadSectionKey,
  VersionLoadsDoc,
} from "../agent/hash-agent/version-load-section";
import {
  browserCallExtension,
  BrowserCallsDoc,
  browserToolName,
  claimBrowserCall,
  finishBrowserCall,
} from "../browser-call/browser-call";
import { createBrowserCallRouter } from "../browser-call/browser-call-router";
import {
  createDurableAgentsServer,
  type DurableAgentsServerLimits,
  type DurableAgentsServerOptions,
} from "./durable-agents-server";
import { brunchUserInput } from "./durable-agents-server/user-input";
import { AnnouncedVersionLoadDoc } from "./durable-agents-server/version-load";
import { browserCallsPrefix } from "./start-durable-agents-server";
import { serveNode } from "./start-durable-agents-server/serve-node";

import type { OwnedStorage } from "./conversation-storage";
import type { AssistantMessage, Message } from "@earendil-works/pi-ai";

const context = BACKGROUND_CONTEXT;
const origin = "http://durable.test";
const chatId = "chat-1";
const toolCallId = "call-1";
const title = "Laundry line";
const browserOutput = { ok: true, title };
const answer = "I set the net's title to Laundry line, as you asked.";

const servers: { close: () => Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

/** Every conversation in memory: one process, which always owns what it opened. */
const memoryConversations = () => {
  const stores = new Map<string, OwnedStorage>();
  return {
    openStorage: async (conversationId: string): Promise<OwnedStorage> => {
      const existing = stores.get(conversationId);
      if (existing !== undefined) return existing;
      const storage = Object.assign(new MemoryStorage(), {
        isOwner: async () => true,
      });
      stores.set(conversationId, storage);
      return storage;
    },
    storageExists: async (conversationId: string) => stores.has(conversationId),
    stores,
  };
};

/** The model calls `setNetTitle`, then answers. */
const browserToolTurn = (): FauxResponseStep[] => [
  fauxAssistantMessage(
    fauxToolCall(browserToolName, { title }, { id: toolCallId }),
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage(answer),
];

type ChatOptions = {
  readonly responses?: FauxResponseStep[];
  readonly limits?: Partial<DurableAgentsServerLimits>;
  /** Installed beside the browser-call extension. */
  readonly extensions?: readonly Extension[];
  readonly onReport?: DurableAgentsServerOptions["onReport"];
};

/**
 * A server whose model calls `setNetTitle`, then answers, streamed slowly
 * enough to show partials, and AI SDK's own client, calling it in-process.
 */
const openChat = ({
  responses = browserToolTurn(),
  limits,
  extensions = [],
  onReport,
}: ChatOptions = {}) => {
  const faux = fauxProvider({
    tokensPerSecond: 300,
    tokenSize: { min: 3, max: 5 },
  });
  faux.setResponses(responses);
  const models = createModels();
  models.setProvider(faux.provider);
  const storage = memoryConversations();
  const server = createDurableAgentsServer({
    openStorage: storage.openStorage,
    storageExists: storage.storageExists,
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
    onReport,
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
  return { server, transport, faux, storage };
};

const userMessage: UIMessage = {
  id: "user-1",
  role: "user",
  parts: [{ type: "text", text: "Call the net Laundry line." }],
};

const send = (
  transport: ChatTransport<UIMessage>,
  { id = chatId, message = userMessage } = {},
) =>
  transport.sendMessages({
    trigger: "submit-message",
    chatId: id,
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
  };
};

/** The conversation, which the test knows exists. */
const openConversation = async (
  server: ReturnType<typeof openChat>["server"],
  id = chatId,
) => {
  const conversation = await server.conversations.acquire(id);
  if (conversation === undefined) throw new Error(`No conversation ${id}.`);
  return conversation;
};

/** Claim the call as the panel does after `onToolCall`, retrying until it is issued. */
const claimAsBrowser = async (
  server: ReturnType<typeof openChat>["server"],
) => {
  for (;;) {
    // The tool task issues the call after the assistant entry commits; Brunch's panel retries its 404 too.
    // eslint-disable-next-line no-await-in-loop
    const { harness, root } = await openConversation(server);
    // eslint-disable-next-line no-await-in-loop
    const claim = await claimBrowserCall(harness, root.id, toolCallId, context);
    if (claim !== undefined) return { harness, root, claim };
    // eslint-disable-next-line no-await-in-loop
    await sleep(5);
  }
};

/** What the panel's in-band browser call does after `onToolCall`, by direct host calls. */
const actAsBrowser = async (server: ReturnType<typeof openChat>["server"]) => {
  const { harness, root, claim } = await claimAsBrowser(server);
  return finishBrowserCall(
    harness,
    {
      conversationId: root.id,
      toolCallId,
      toolName: claim.toolName,
      capability: claim.capability,
      canonicalInput: claim.input,
      output: browserOutput,
    },
    context,
  );
};

/** Consecutive text deltas folded, so the sequence does not depend on stream timing. */
const chunkTypes = (chunks: readonly UIMessageChunk[]) =>
  chunks
    .map(({ type }) => type)
    .filter(
      (type, index, types) =>
        type !== "text-delta" || types[index - 1] !== "text-delta",
    );

/**
 * `createFlueUiStream`'s chunks for the same logical turn: `message-started`
 * opens the message and a step; a client tool's `tool-input` is
 * `tool-input-available` without `providerExecuted`; `message-completed` ends
 * the step; the tool's `tool-output` is `tool-output-available` with
 * `providerExecuted: true`; the answer's `message-started` opens a step whose
 * `message-delta`s are one text part, ended with the step; `submission-settled`
 * `completed` is `finish` with `finishReason: "stop"`.
 */
const flueTurnChunkTypes = [
  "start",
  "start-step",
  "tool-input-available",
  "finish-step",
  "tool-output-available",
  "start-step",
  "text-start",
  "text-delta",
  "text-end",
  "finish-step",
  "finish",
];

/** The message AI SDK's own reducer builds from `chunks`, continuing `from` when given. */
const reduce = async (chunks: readonly UIMessageChunk[], from?: UIMessage) => {
  let message: UIMessage | undefined;
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  for await (const next of readUIMessageStream({
    message: from,
    stream,
    terminateOnError: true,
  })) {
    message = next;
  }
  return message;
};

const startMessageId = (chunks: readonly UIMessageChunk[]) => {
  const start = chunks.find(({ type }) => type === "start");
  return start?.type === "start" ? start.messageId : undefined;
};

const expectFlueTurn = async (chunks: readonly UIMessageChunk[]) => {
  expect(chunkTypes(chunks)).toEqual(flueTurnChunkTypes);
  expect(startMessageId(chunks)).toMatch(/^durable:\d+$/);
  expect(Object.keys(chunks[0] ?? {}).toSorted()).toEqual([
    "messageId",
    "type",
  ]);
  expect(chunks.find(({ type }) => type === "tool-input-available")).toEqual({
    type: "tool-input-available",
    toolCallId,
    toolName: browserToolName,
    input: { title },
  });
  expect(chunks.find(({ type }) => type === "tool-output-available")).toEqual({
    type: "tool-output-available",
    toolCallId,
    output: browserOutput,
    providerExecuted: true,
  });
  const text = chunks.flatMap((chunk) =>
    chunk.type === "text-delta" ? [chunk.delta] : [],
  );
  expect(text.join("")).toBe(answer);
  expect(chunks.at(-1)).toEqual({ type: "finish", finishReason: "stop" });

  // The parts the panel reads, as the AI SDK's own reducer builds them.
  const message = await reduce(chunks);
  expect(message?.id).toBe(startMessageId(chunks));
  expect(message?.parts).toEqual([
    { type: "step-start" },
    {
      type: `tool-${browserToolName}`,
      toolCallId,
      state: "output-available",
      input: { title },
      output: browserOutput,
      providerExecuted: true,
    },
    { type: "step-start" },
    { type: "text", text: answer, state: "done" },
  ]);
  return text;
};

test("the server speaks AI SDK's UI message stream protocol", async () => {
  const { server } = openChat();
  const response = await server.app.request(`${origin}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: chatId,
      messages: [userMessage],
      trigger: "submit-message",
    }),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
  const reader: ReadableStreamDefaultReader<Uint8Array> =
    response.body!.getReader();
  const { value } = await reader.read();
  expect(new TextDecoder().decode(value)).toMatch(
    /^data: \{"type":"start","messageId":"durable:\d+"\}\n\n/,
  );
  await reader.cancel();

  const regenerate = await server.app.request(`${origin}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: chatId,
      messages: [userMessage],
      trigger: "regenerate-message",
      messageId: "assistant-1",
    }),
  });
  expect(regenerate.status).toBe(400);
});

test("a browser-tool turn yields Flue's chunks and parts", async () => {
  const { server, transport } = openChat();
  const stream = recorder(await send(transport));

  // The panel's `onToolCall` fires on this chunk.
  await stream.until(({ type }) => type === "tool-input-available");
  expect(await actAsBrowser(server)).toBe("settled");
  await stream.drain();

  const deltas = await expectFlueTurn(stream.chunks);
  // Streamed from `pi.live.generation`, not only the committed answer.
  expect(deltas.length).toBeGreaterThan(1);
});

test("a reconnect mid-call starts from the committed view and completes the turn", async () => {
  const { server, transport } = openChat();
  const first = recorder(await send(transport));
  await first.until(({ type }) => type === "tool-input-available");
  const heldAtReconnect = await reduce(first.chunks);

  const reattached = await transport.reconnectToStream({ chatId });
  expect(reattached).not.toBeNull();
  const second = recorder(reattached!);
  await second.until(({ type }) => type === "tool-input-available");
  // The committed view alone shows the pending call.
  expect(chunkTypes(second.chunks)).toEqual([
    "start",
    "start-step",
    "tool-input-available",
  ]);

  await actAsBrowser(server);
  await Promise.all([first.drain(), second.drain()]);

  // Same message, same parts, none twice.
  await expectFlueTurn(first.chunks);
  await expectFlueTurn(second.chunks);
  expect(startMessageId(second.chunks)).toBe(startMessageId(first.chunks));

  // Idle: nothing to reattach to.
  expect(await transport.reconnectToStream({ chatId })).toBeNull();

  // The reconnect replays the running answer from its start, so a client
  // resumes from history that ends at the running input. One that keeps the
  // partial assistant message it held, which the AI SDK continues, gets every
  // replayed part again.
  const continued = await reduce(second.chunks, heldAtReconnect);
  expect(continued?.parts.map(({ type }) => type)).toEqual([
    "step-start",
    `tool-${browserToolName}`,
    "step-start",
    `tool-${browserToolName}`,
    "step-start",
    "text",
  ]);
});

test("stop while a browser call is pending ends the stream with an abort", async () => {
  const { server, transport } = openChat();
  const stream = recorder(await send(transport));
  await stream.until(({ type }) => type === "tool-input-available");

  const stopped = await server.app.request(`${origin}/chat/${chatId}/abort`, {
    method: "POST",
  });
  expect(stopped.status).toBe(204);
  await stream.drain();

  expect(chunkTypes(stream.chunks)).toEqual([
    "start",
    "start-step",
    "tool-input-available",
    "finish-step",
    "tool-output-error",
    "abort",
  ]);
  expect(stream.chunks.at(-1)).toEqual({
    type: "abort",
    reason: "The chat turn aborted.",
  });
  // The error text is the entry's diagnostics, not the model-facing block.
  expect(
    stream.chunks.find(({ type }) => type === "tool-output-error"),
  ).toEqual({
    type: "tool-output-error",
    toolCallId,
    errorText: "Tool setNetTitle was aborted",
    providerExecuted: true,
  });
  const message = await reduce(stream.chunks);
  expect(
    message?.parts.find((part) => part.type === `tool-${browserToolName}`),
  ).toMatchObject({ toolCallId, state: "output-error" });
});

test("re-sending a user message follows its first run instead of starting another", async () => {
  const { server, transport, faux } = openChat();
  const first = recorder(await send(transport));
  await first.until(({ type }) => type === "tool-input-available");
  // A retry of the same request while the first is running.
  const again = recorder(await send(transport));

  await actAsBrowser(server);
  await Promise.all([first.drain(), again.drain()]);
  await expectFlueTurn(first.chunks);
  await expectFlueTurn(again.chunks);
  expect(startMessageId(again.chunks)).toBe(startMessageId(first.chunks));

  // And once it has answered: the same answer again, no new run.
  const late = recorder(await send(transport));
  await late.drain();
  await expectFlueTurn(late.chunks);
  expect(startMessageId(late.chunks)).toBe(startMessageId(first.chunks));

  expect(faux.state.callCount).toBe(2);
  const { root } = await openConversation(server);
  const entries = await root.entries(
    { order: "ascending" },
    100,
    undefined,
    context,
  );
  expect(
    entries.items.filter((entry) => entry.model?.[0]?.role === "user"),
  ).toHaveLength(1);
  expect(
    entries.items.filter(({ kind }) => kind === "brunch.user"),
  ).toHaveLength(1);
});

/** The model's user messages, by what they read, in each request it was sent. */
const userTexts = (requests: readonly Message[][]) =>
  requests.map((messages) =>
    messages.flatMap((message) =>
      message.role !== "user"
        ? []
        : typeof message.content === "string"
          ? [message.content]
          : [
              message.content
                .flatMap((part) => (part.type === "text" ? [part.text] : []))
                .join(""),
            ],
    ),
  );

/** `count` answers, each recording the messages of the request it answers. */
const recordedAnswers = (count: number) => {
  const requests: Message[][] = [];
  const responses = Array.from(
    { length: count },
    (_, index): FauxResponseStep =>
      (requestContext) => {
        requests.push(structuredClone(requestContext.messages));
        return fauxAssistantMessage(`Answer ${index + 1}.`);
      },
  );
  return { requests, responses };
};

const userText = "Add a dryer.";
const diagnosticsContext = "Net check: 2 warnings.";
const submissionContext = { interviewBudget: { questions: 3 } };

/** What the panel sends today, by its envelope. */
const panelBodies = {
  ordinary: userText,
  "v1 diagnostics": petrinautContextualUserMessageBody({
    userText,
    diagnosticsContext,
  }),
  "v2 context": petrinautContextualUserMessageBody({
    userText,
    diagnosticsContext: "",
    submissionContext,
  }),
  "v2 context and diagnostics": petrinautContextualUserMessageBody({
    userText,
    diagnosticsContext,
    submissionContext,
  }),
  malformed: `petrinaut-contextual-user-message:v2\n{not json`,
};

/**
 * What the model reads of each body: the user's words without submission
 * context, as Brunch's model-only projection gave them, pinned as text.
 */
const modelReads: Record<keyof typeof panelBodies, string> = {
  ordinary: "Add a dryer.",
  "v1 diagnostics":
    'petrinaut-contextual-user-message:v1\n{"userText":"Add a dryer.","diagnosticsContext":"Net check: 2 warnings."}',
  "v2 context": "Add a dryer.",
  "v2 context and diagnostics":
    'petrinaut-contextual-user-message:v1\n{"userText":"Add a dryer.","diagnosticsContext":"Net check: 2 warnings."}',
  malformed: "petrinaut-contextual-user-message:v2\n{not json",
};

describe("POST /chat admits a brunch.user input", () => {
  test.each(Object.keys(panelBodies) as (keyof typeof panelBodies)[])(
    "%s: the model reads the user's words without submission context; the entry keeps the parse",
    async (kind) => {
      const body = panelBodies[kind];
      const { requests, responses } = recordedAnswers(1);
      const { server, transport } = openChat({ responses });
      const message: UIMessage = {
        id: "user-1",
        role: "user",
        // Split as a client may; the server joins text parts.
        parts: [
          { type: "text", text: body.slice(0, 7) },
          { type: "text", text: body.slice(7) },
        ],
      };
      const stream = recorder(await send(transport, { message }));
      await stream.drain();
      expect(stream.chunks.at(-1)).toEqual({
        type: "finish",
        finishReason: "stop",
      });

      const expected = modelReads[kind];
      expect(userTexts(requests)).toEqual([[expected]]);
      const { root } = await openConversation(server);
      const entries = await root.entries(
        { order: "ascending" },
        100,
        undefined,
        context,
      );
      const input = entries.items.find(
        ({ kind: entryKind }) => entryKind === "brunch.user",
      );
      expect(input).toMatchObject({
        kind: "brunch.user",
        data: brunchUserInput(body).entry.data,
        model: [{ role: "user", content: expected }],
      });
    },
  );

  test("a retry with the message id, even after a newer message, finds the first entry unchanged", async () => {
    const { requests, responses } = recordedAnswers(2);
    const { server, transport } = openChat({ responses });
    const first: UIMessage = {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: panelBodies["v2 context"] }],
    };
    const firstStream = recorder(await send(transport, { message: first }));
    await firstStream.drain();
    await recorder(
      await send(transport, {
        message: {
          id: "user-2",
          role: "user",
          parts: [{ type: "text", text: "And a washer." }],
        },
      }),
    ).drain();
    // A late retry of the first message, its body since changed.
    const late = recorder(
      await send(transport, {
        message: {
          ...first,
          parts: [{ type: "text", text: "Something else." }],
        },
      }),
    );
    await late.drain();

    expect(startMessageId(late.chunks)).toBe(
      startMessageId(firstStream.chunks),
    );
    expect(requests).toHaveLength(2);
    const { harness, root } = await openConversation(server);
    // The client's message id is still `durable:<input entry ID>` of the first admission.
    const firstSubmission = await harness.commit(
      async (tx) => tx.submissionByRequest(root.id, "user-1"),
      context,
    );
    expect(startMessageId(late.chunks)).toBe(
      `durable:${firstSubmission?.entry}`,
    );
    const entries = await root.entries(
      { order: "ascending" },
      100,
      undefined,
      context,
    );
    expect(
      entries.items
        .filter(({ kind }) => kind === "brunch.user")
        .map(({ data }) => data),
    ).toEqual([
      { body: "contextual", userText, submissionContext },
      { body: "ordinary", userText: "And a washer." },
    ]);
  });

  test("an old pi.user envelope in the conversation is kept, and reaches the model as stored (H11)", async () => {
    const ask = async () => {
      const { requests, responses } = recordedAnswers(2);
      const { server, transport } = openChat({ responses });
      // As `POST /chat` admitted before `brunch.user`: the panel's body as a plain input.
      const conversation = await server.conversations.create(chatId);
      const old = await conversation.root.submit(
        {
          type: "input",
          content: panelBodies["v2 context"],
          requestId: "user-old",
        },
        context,
      );
      await old.wait(context);
      await recorder(await send(transport)).drain();
      const { root } = await openConversation(server);
      const entries = await root.entries(
        { order: "ascending" },
        100,
        undefined,
        context,
      );
      return {
        texts: userTexts(requests).at(-1),
        kinds: entries.items
          .filter(({ kind }) => kind.endsWith(".user"))
          .map(({ kind }) => kind),
      };
    };
    const newText =
      userMessage.parts[0]?.type === "text" ? userMessage.parts[0].text : "";
    expect(await ask()).toEqual({
      texts: [panelBodies["v2 context"], newText],
      kinds: ["pi.user", "brunch.user"],
    });
  });
});

describe("POST /chat admits Ledger comments", () => {
  test("a body of comments is a brunch.ledger-comments input the model reads as Flue's signal", async () => {
    const { requests, responses } = recordedAnswers(1);
    const { server, transport } = openChat({ responses });
    const comments = [
      { id: "n1", records: ["e1"], text: "People, not a place." },
    ];
    const text = JSON.stringify({ comments });
    await recorder(
      await send(transport, {
        message: {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text }],
        },
      }),
    ).drain();

    const expected = brunchUserInput(text).content;
    expect(expected).toMatch(/^<brunch\.ledger-comments /);
    expect(userTexts(requests)).toEqual([[expected]]);
    const { root } = await openConversation(server);
    const entries = await root.entries(
      { order: "ascending" },
      100,
      undefined,
      context,
    );
    expect(
      entries.items.filter(({ model }) => model?.[0]?.role === "user"),
    ).toMatchObject([
      {
        kind: "brunch.ledger-comments",
        data: { comments },
        model: [{ role: "user", content: expected }],
      },
    ]);
  });
});

describe("POST /chat records a version load for the version_load section (fold 2c)", () => {
  const load1 = { id: "version-1", decisionTime: "2026-11-12T09:30:00.000Z" };
  const load2 = { id: "version-2", decisionTime: "2026-11-12T10:45:00.000Z" };
  const loadMessage = (
    id: string,
    words: string,
    versionLoad: typeof load1,
  ): UIMessage => ({
    id,
    role: "user",
    parts: [
      {
        type: "text",
        text: petrinautContextualUserMessageBody({
          userText: words,
          diagnosticsContext: "",
          submissionContext: { versionLoad },
        }),
      },
    ],
  });

  const section = (load: typeof load1) =>
    `<${versionLoadSectionKey}>\n${versionLoadSectionText(load)}\n</${versionLoadSectionKey}>`;

  /** Each request's messages by shape, a `version_load` delta by the load it states. */
  const withLoads = (requests: readonly Message[][]) =>
    requests.map((messages) =>
      messages.flatMap((message) => {
        if (message.role === "user") return [`user:${textOf(message)}`];
        if (message.role !== "system") return [];
        const value = message.sections?.[versionLoadSectionKey];
        if (value === section(load1)) return ["version_load:1"];
        if (value === section(load2)) return ["version_load:2"];
        return value === undefined ? [] : [`version_load:${String(value)}`];
      }),
    );

  test("the first input with a load shows the section once, the next with it nothing, a new load one delta; the content stays the user's; a late retry writes nothing", async () => {
    const { requests, responses } = recordedAnswers(3);
    const { server, transport } = openChat({
      responses,
      extensions: [versionLoadSectionExtension],
    });
    const first = loadMessage("user-1", "Add a dryer.", load1);
    const firstStream = recorder(await send(transport, { message: first }));
    await firstStream.drain();
    await recorder(
      await send(transport, {
        message: loadMessage("user-2", "And a washer.", load1),
      }),
    ).drain();
    await recorder(
      await send(transport, {
        message: loadMessage("user-3", "Now a press.", load2),
      }),
    ).drain();

    // Pi moves the conversation's first system message to the front; a later delta follows its input. The second request adds none.
    expect(withLoads(requests)).toEqual([
      ["version_load:1", "user:Add a dryer."],
      ["version_load:1", "user:Add a dryer.", "user:And a washer."],
      [
        "version_load:1",
        "user:Add a dryer.",
        "user:And a washer.",
        "user:Now a press.",
        "version_load:2",
      ],
    ]);
    const { harness, root } = await openConversation(server);
    const submissions = await Promise.all(
      ["user-1", "user-3"].map((requestId) =>
        root.commit(
          (tx) => tx.submissionByRequest(root.id, requestId),
          context,
        ),
      ),
    );
    const recorded = [
      { ...load1, submission: submissions[0]?.id },
      { ...load2, submission: submissions[1]?.id },
    ];
    expect(await harness.snapshot(VersionLoadsDoc, root.id, context)).toEqual({
      loads: recorded,
    });
    expect(
      await harness.snapshot(AnnouncedVersionLoadDoc, root.id, context),
    ).toBeUndefined();

    // A late retry of the first message, after the newer load: its first submission, and no write.
    const late = recorder(await send(transport, { message: first }));
    await late.drain();
    expect(startMessageId(late.chunks)).toBe(
      startMessageId(firstStream.chunks),
    );
    expect(requests).toHaveLength(3);
    expect(await harness.snapshot(VersionLoadsDoc, root.id, context)).toEqual({
      loads: recorded,
    });
    const entries = await root.entries(
      { order: "ascending" },
      100,
      undefined,
      context,
    );
    const inputs = entries.items.filter(({ kind }) => kind === "brunch.user");
    expect(inputs.map(({ data }) => data)).toEqual([
      {
        body: "contextual",
        userText: "Add a dryer.",
        submissionContext: { versionLoad: load1 },
      },
      {
        body: "contextual",
        userText: "And a washer.",
        submissionContext: { versionLoad: load1 },
      },
      {
        body: "contextual",
        userText: "Now a press.",
        submissionContext: { versionLoad: load2 },
      },
    ]);
  });

  test("a load admitted while another run is busy shows in its own run, not in the busy run's next request (V1)", async () => {
    const hold = holdTool();
    const requests: Message[][] = [];
    const recorded =
      (message: AssistantMessage): FauxResponseStep =>
      (requestContext) => {
        requests.push(structuredClone(requestContext.messages));
        return message;
      };
    const { transport } = openChat({
      responses: [
        recorded(
          fauxAssistantMessage(
            fauxToolCall(hold.tool.name, {}, { id: "hold-1" }),
            { stopReason: "toolUse" },
          ),
        ),
        recorded(fauxAssistantMessage("Held.")),
        recorded(fauxAssistantMessage("Pressed.")),
      ],
      extensions: [
        versionLoadSectionExtension,
        defineExtension({ name: "probe.hold", tools: [hold.tool] }),
      ],
    });
    const busy = recorder(
      await send(transport, {
        message: loadMessage("user-1", "Add a dryer.", load1),
      }),
    );
    await hold.started;
    // Queued behind the held run: its load commits now, before that run's next request.
    const followUp = recorder(
      await send(transport, {
        message: loadMessage("user-2", "Now a press.", load2),
      }),
    );
    hold.release();
    await Promise.all([busy.drain(), followUp.drain()]);

    expect(withLoads(requests)).toEqual([
      ["version_load:1", "user:Add a dryer."],
      ["version_load:1", "user:Add a dryer."],
      [
        "version_load:1",
        "user:Add a dryer.",
        "user:Now a press.",
        "version_load:2",
      ],
    ]);
  });

  test("a conversation that announced a load in its content before the section records that load no more, and the next one as new", async () => {
    const { requests, responses } = recordedAnswers(3);
    const { server, transport } = openChat({
      responses,
      extensions: [versionLoadSectionExtension],
    });
    await recorder(
      await send(transport, {
        message: { ...userMessage, id: "user-0" },
      }),
    ).drain();
    const { harness, root } = await openConversation(server);
    await root.commit(async (tx) => {
      const announced = await tx.doc(AnnouncedVersionLoadDoc, root.id);
      announced.announced = load1.id;
    }, context);

    await recorder(
      await send(transport, {
        message: loadMessage("user-1", "Add a dryer.", load1),
      }),
    ).drain();
    await recorder(
      await send(transport, {
        message: loadMessage("user-2", "Now a press.", load2),
      }),
    ).drain();

    expect(withLoads(requests).at(-1)).toEqual([
      "user:Call the net Laundry line.",
      "user:Add a dryer.",
      "user:Now a press.",
      "version_load:2",
    ]);
    expect(
      (await harness.snapshot(VersionLoadsDoc, root.id, context))?.loads.map(
        ({ id }) => id,
      ),
    ).toEqual([load2.id]);
  });
});

describe("POST /chat reads only the last message's id, role and text parts", () => {
  const post = (
    server: ReturnType<typeof createDurableAgentsServer>,
    messages: readonly unknown[],
  ) =>
    server.app.request(`${origin}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: chatId, trigger: "submit-message", messages }),
    });

  test.each([
    ["without parts", { id: "user-1", role: "user" }],
    ["whose parts are not a list", { id: "user-1", role: "user", parts: "Hi" }],
    [
      "without a string id",
      { role: "user", parts: [{ type: "text", text: "Hi" }] },
    ],
  ])(
    "a last user message %s is a 400, before any storage lookup or model call",
    async (_, message) => {
      const { models, model, state } = scriptedModel([]);
      const storage = memoryConversations();
      const storageExists = vi.fn<typeof storage.storageExists>(
        storage.storageExists,
      );
      const openStorage = vi.fn<typeof storage.openStorage>(
        storage.openStorage,
      );
      const server = createDurableAgentsServer({
        storageExists,
        openStorage,
        createRegistry,
        models,
        agent: { model },
        clientToolNames: new Set<string>(),
        context,
      });
      servers.push(server);

      const response = await post(server, [message]);
      expect(response.status).toBe(400);
      expect(storageExists).not.toHaveBeenCalled();
      expect(openStorage).not.toHaveBeenCalled();
      expect(state.callCount).toBe(0);
    },
  );

  test("earlier messages and the last message's other parts are not read: its text parts are the input", async () => {
    const { requests, responses } = recordedAnswers(1);
    const { server } = openChat({ responses });
    const response = await post(server, [
      null,
      { role: "assistant" },
      {
        id: "user-1",
        role: "user",
        parts: [
          null,
          "Hi",
          { type: "text" },
          { type: "text", text: 5 },
          { type: "reasoning", text: "Hmm." },
          { type: "text", text: "Add a dryer." },
        ],
      },
    ]);
    expect(response.status).toBe(200);
    await response.text();
    expect(userTexts(requests)).toEqual([["Add a dryer."]]);
  });
});

/** Poll `probe` until it returns a value other than `undefined`, or fail after `timeoutMs`. */
const eventually = async <T>(
  probe: () => Promise<T | undefined>,
  timeoutMs = 5_000,
): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    // Each probe depends on time passing since the one before.
    // eslint-disable-next-line no-await-in-loop
    const value = await probe();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error("Timed out waiting.");
    // eslint-disable-next-line no-await-in-loop
    await sleep(10);
  }
};

const liveOf = async (
  server: ReturnType<typeof openChat>["server"],
  id = chatId,
) => {
  const { harness, root } = await openConversation(server, id);
  return harness.snapshot(LiveDoc, root.id, context);
};

test("routes other than POST /chat find an unknown conversation absent and create nothing", async () => {
  const { server, storage } = openChat();
  const unknown = "never-posted";
  const stream = await server.app.request(`${origin}/chat/${unknown}/stream`);
  expect(stream.status).toBe(404);
  const abort = await server.app.request(`${origin}/chat/${unknown}/abort`, {
    method: "POST",
  });
  expect(abort.status).toBe(404);
  expect(await server.conversations.acquire(unknown)).toBeUndefined();
  expect(storage.stores.has(unknown)).toBe(false);
});

test("a section that throws is reported once, with the conversation whose Harness ran it", async () => {
  const reports: (readonly [string, Report])[] = [];
  const { transport } = openChat({
    responses: [fauxAssistantMessage("Answered.")],
    extensions: [
      defineExtension({
        name: "probe.broken-section",
        sections: [
          section("broken", () => {
            throw new Error("The section failed.");
          }),
        ],
      }),
    ],
    onReport: (conversationId, report) => {
      reports.push([conversationId, report]);
    },
  });
  const stream = recorder(await send(transport));
  await stream.drain();

  expect(stream.chunks.at(-1)).toEqual({
    type: "finish",
    finishReason: "stop",
  });
  expect(
    reports.map(([conversationId, { kind, error }]) => [
      conversationId,
      kind,
      error instanceof Error ? error.message : error,
    ]),
  ).toEqual([[chatId, "extension_error", "The section failed."]]);
});

/** A server tool that answers at once: what a model calls round after round. */
const pingTool = defineTool({
  name: "ping",
  description: "Answers pong.",
  parameters: obj({}),
  execute: async () => ({ output: [{ type: "text", text: "pong" }] }),
});

test("a run that keeps calling tools fails visibly at the 100-round default (HA-3)", async () => {
  const rounds = 100;
  const { server, transport, faux } = openChat({
    responses: Array.from({ length: rounds + 5 }, (_, round) =>
      fauxAssistantMessage(fauxToolCall("ping", {}, { id: `ping-${round}` }), {
        stopReason: "toolUse",
      }),
    ),
    extensions: [defineExtension({ name: "ping", tools: [pingTool] })],
  });
  const stream = recorder(await send(transport));
  await stream.drain();

  expect(faux.state.callCount).toBe(rounds);
  const last = stream.chunks.at(-1);
  expect(last?.type).toBe("error");
  expect(last?.type === "error" ? last.errorText : undefined).toContain(
    `${rounds} turns`,
  );
  expect(
    stream.chunks.filter(({ type }) => type === "tool-output-available"),
  ).toHaveLength(rounds);
  const live = await liveOf(server);
  expect(live?.run).toBeUndefined();
  expect(live?.runFailure?.reason).toBe("turn_limit");
});

test("model requests beyond the slot limit wait for a slot, then all complete", async () => {
  const limit = 2;
  const conversations = 5;
  let active = 0;
  let peak = 0;
  /** A response the provider takes a while over, counting requests in flight at the provider. */
  const slowAnswer: FauxResponseStep = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await sleep(40);
    active -= 1;
    return fauxAssistantMessage("Answered.");
  };
  const { server, transport, faux } = openChat({
    responses: Array.from({ length: conversations }, () => slowAnswer),
    limits: { maxConcurrentRequests: limit },
  });

  const streams = await Promise.all(
    Array.from({ length: conversations }, async (_, index) =>
      recorder(
        await send(transport, {
          id: `chat-slots-${index}`,
          message: { ...userMessage, id: `user-slots-${index}` },
        }),
      ),
    ),
  );
  // Submitted, not refused: the requests past the limit wait.
  await eventually(async () =>
    server.requestSlots.state().waiting === conversations - limit
      ? true
      : undefined,
  );
  await Promise.all(streams.map((stream) => stream.drain()));

  for (const stream of streams)
    expect(stream.chunks.at(-1)).toEqual({
      type: "finish",
      finishReason: "stop",
    });
  expect(faux.state.callCount).toBe(conversations);
  expect(peak).toBe(limit);
  expect(server.requestSlots.state()).toEqual({ inFlight: 0, waiting: 0 });
});

const abandonedTurnMs = 150;

test.each([true, false])(
  "a POST disconnected before response detaches its accepted turn (held claim: %s)",
  // Each case checks a different terminal outcome after the same disconnect.
  /* eslint-disable vitest/no-conditional-expect */
  async (held) => {
    const { server, faux } = openChat({ limits: { abandonedTurnMs } });
    const accepted = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const detached = Promise.withResolvers<void>();
    const listener = await serveNode(
      async (request) => {
        const response = await server.app.fetch(request);
        if (request.method === "POST") {
          request.signal.addEventListener("abort", () => detached.resolve(), {
            once: true,
          });
          accepted.resolve();
          await release.promise;
        }
        return response;
      },
      { port: 0, hostname: "127.0.0.1" },
    );
    const client = new AbortController();
    const post = fetch(`http://127.0.0.1:${listener.port}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        trigger: "submit-message",
        messages: [userMessage],
      }),
      signal: client.signal,
    }).catch(() => undefined);
    try {
      await accepted.promise;
      client.abort();
      await detached.promise;
      release.resolve();
      if (!held) {
        const { harness, root } = await openConversation(server);
        expect((await harness.inspect(context)).submissions).toEqual([
          expect.objectContaining({ requestId: userMessage.id }),
        ]);
        expect((await liveOf(server))?.run).toBeDefined();
        await eventually(async () => {
          const live = await liveOf(server);
          return live?.runFailure?.reason === "aborted" ? true : undefined;
        });
        expect(await root.waitForIdle(context)).toBeUndefined();
        return;
      }
      const { harness, root, claim } = await claimAsBrowser(server);
      // The response detach must not stop the accepted turn or revoke the browser's claim.
      await sleep(abandonedTurnMs * 2);
      expect((await liveOf(server))?.run).toBeDefined();
      const transport = new DefaultChatTransport<UIMessage>({
        api: `http://127.0.0.1:${listener.port}/chat`,
      });
      const stream = recorder((await transport.reconnectToStream({ chatId }))!);
      await finishBrowserCall(
        harness,
        {
          conversationId: root.id,
          toolCallId,
          toolName: claim.toolName,
          capability: claim.capability,
          canonicalInput: claim.input,
          output: browserOutput,
        },
        context,
      );
      await stream.drain();
      await expectFlueTurn(stream.chunks);
      expect(faux.state.callCount).toBe(2);
    } finally {
      client.abort();
      release.resolve();
      await Promise.all([post, listener.close()]);
    }
  },
  /* eslint-enable vitest/no-conditional-expect */
);

test("settling a held claim lets the sweep reconsider a later unclaimed call", async () => {
  const nextCall = "call-2";
  const { server, transport } = openChat({
    responses: [
      browserToolTurn()[0]!,
      fauxAssistantMessage(
        fauxToolCall(browserToolName, { title }, { id: nextCall }),
        { stopReason: "toolUse" },
      ),
    ],
    limits: { abandonedTurnMs },
  });
  const stream = recorder(await send(transport));
  await stream.until(({ type }) => type === "tool-input-available");
  const { harness, root, claim } = await claimAsBrowser(server);
  await stream.cancel();
  await sleep(abandonedTurnMs * 2);
  await finishBrowserCall(
    harness,
    {
      conversationId: root.id,
      toolCallId,
      toolName: claim.toolName,
      capability: claim.capability,
      canonicalInput: claim.input,
      output: browserOutput,
    },
    context,
  );
  await eventually(async () => {
    const call = (await harness.snapshot(BrowserCallsDoc, root.id, context))
      ?.calls[nextCall];
    return call?.status === "stopped" ? true : undefined;
  }, 3_000);
  expect((await liveOf(server))?.runFailure?.reason).toBe("aborted");
});

test("closing a live Harness interrupts its response rather than ending the submission", async () => {
  const { server, transport } = openChat();
  const stream = recorder(await send(transport));
  await stream.until(({ type }) => type === "tool-input-available");
  await server.close();
  await expect(stream.drain()).rejects.toThrow(
    "chat stream ended before the turn settled",
  );
  expect(
    stream.chunks.some(
      ({ type }) => type === "finish" || type === "abort" || type === "error",
    ),
  ).toBe(false);
});

test("an unwatched turn whose call nobody claimed is aborted after the timeout", async () => {
  const { server, transport } = openChat({ limits: { abandonedTurnMs } });
  const stream = recorder(await send(transport));
  await stream.until(({ type }) => type === "tool-input-available");
  await stream.cancel();

  const live = await eventually(async () => {
    const current = await liveOf(server);
    return current?.run === undefined ? current : undefined;
  });
  expect(live.runFailure?.reason).toBe("aborted");
  const { harness, root } = await openConversation(server);
  const calls = await harness.snapshot(BrowserCallsDoc, root.id, context);
  expect(calls?.calls[toolCallId]?.status).toBe("stopped");
});

test("a claimed browser call keeps an unwatched turn alive", async () => {
  const { server, transport } = openChat({ limits: { abandonedTurnMs } });
  const stream = recorder(await send(transport));
  await stream.until(({ type }) => type === "tool-input-available");
  const { harness, root, claim } = await claimAsBrowser(server);
  await stream.cancel();

  await sleep(abandonedTurnMs * 4);
  expect((await liveOf(server))?.run).toBeDefined();

  // The browser answers long after the timeout; the turn completes.
  const reattached = recorder((await transport.reconnectToStream({ chatId }))!);
  await finishBrowserCall(
    harness,
    {
      conversationId: root.id,
      toolCallId,
      toolName: claim.toolName,
      capability: claim.capability,
      canonicalInput: claim.input,
      output: browserOutput,
    },
    context,
  );
  await reattached.drain();
  expect(reattached.chunks.at(-1)).toEqual({
    type: "finish",
    finishReason: "stop",
  });
});

test("a HEAD request is refused before any route runs, so it follows no turn", async () => {
  const { server, transport } = openChat({ limits: { abandonedTurnMs } });
  // Mounted as the production server mounts them: after the chat routes, under an outer app.
  server.app.route(
    browserCallsPrefix,
    createBrowserCallRouter({
      resolveHarness: async (conversationId) =>
        (await server.conversations.acquire(conversationId))?.harness,
      now: server.now,
    }),
  );
  const app = new Hono();
  app.route("/", server.app);
  const listener = await serveNode(app.fetch, {
    port: 0,
    hostname: "127.0.0.1",
  });
  try {
    const stream = recorder(await send(transport));
    await stream.until(({ type }) => type === "tool-input-available");
    await stream.cancel();

    const base = `http://127.0.0.1:${listener.port}`;
    const heads = await Promise.all(
      [
        `${base}/chat/${chatId}/stream`,
        `${base}${browserCallsPrefix}/${chatId}/browser-calls`,
      ].map((url) => fetch(url, { method: "HEAD" })),
    );
    expect(heads.map(({ status }) => status)).toEqual([405, 405]);

    // Nothing watches the turn, so the sweep aborts it after the timeout.
    const live = await eventually(async () => {
      const current = await liveOf(server);
      return current?.run === undefined ? current : undefined;
    }, abandonedTurnMs * 10);
    expect(live.runFailure?.reason).toBe("aborted");
  } finally {
    await listener.close();
  }
});

test("a watched turn outlives the timeout", async () => {
  const { server, transport } = openChat({ limits: { abandonedTurnMs } });
  const stream = recorder(await send(transport));
  await stream.until(({ type }) => type === "tool-input-available");

  await sleep(abandonedTurnMs * 4);
  expect((await liveOf(server))?.run).toBeDefined();
  await actAsBrowser(server);
  await stream.drain();
  await expectFlueTurn(stream.chunks);
});
