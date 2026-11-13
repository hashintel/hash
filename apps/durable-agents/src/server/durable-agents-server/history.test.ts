/**
 * `GET /chat/:id/messages` through a test-only app over the real server: a
 * reopened conversation's messages are what AI SDK's client built from the
 * live stream, with the user's own words, hand-edit notes and Ledger
 * comments as their own parts, and prune writes hidden.
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
  type EntryRecord,
  MemoryStorage,
} from "@earendil-works/pi-durable";
import {
  type ChatTransport,
  DefaultChatTransport,
  readUIMessageStream,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { Hono } from "hono";
import { afterEach, expect, test } from "vitest";

import { petrinautContextualUserMessageBody } from "@hashintel/brunch-agent";

import {
  fauxAssistantMessage,
  fauxToolCall,
} from "../../../test/scripted-model";
import { pruneEntryKind } from "../../agent/hash-agent/read-back-pruning";
import {
  browserCallExtension,
  browserToolName,
  claimBrowserCall,
  finishBrowserCall,
} from "../../browser-call/browser-call";
import { handEditWrite } from "../../browser-call/hand-edit";
import { createDurableAgentsServer } from "../durable-agents-server";
import { historyHandler } from "./history";

import type { OwnedStorage } from "../conversation-storage";

const context = BACKGROUND_CONTEXT;
const origin = "http://durable.test";
const chatId = "chat-1";
const toolCallId = "call-1";
const title = "Laundry line";
const browserOutput = { ok: true, title };
const clientToolNames = new Set([browserToolName]);

const servers: { close: () => Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

/** The server, with the history route mounted beside it, and AI SDK's own client calling it in-process. */
const openChat = (responses: FauxResponseStep[]) => {
  const faux = fauxProvider({
    tokensPerSecond: 300,
    tokenSize: { min: 3, max: 5 },
  });
  faux.setResponses(responses);
  const models = createModels();
  models.setProvider(faux.provider);
  const stores = new Map<string, OwnedStorage>();
  const server = createDurableAgentsServer({
    openStorage: async (conversationId) => {
      const storage =
        stores.get(conversationId) ??
        Object.assign(new MemoryStorage(), { isOwner: async () => true });
      stores.set(conversationId, storage);
      return storage;
    },
    storageExists: async (conversationId) => stores.has(conversationId),
    createRegistry: () => {
      const registry = createRegistry();
      registry.install(browserCallExtension);
      return registry;
    },
    models,
    agent: {
      model: { provider: faux.provider.id, modelId: faux.getModel().id },
    },
    settings: { progress: { partialIntervalMs: 5, outputIntervalMs: 5 } },
    clientToolNames,
    context,
  });
  servers.push(server);
  const app = new Hono();
  app.get(
    "/chat/:id/messages",
    historyHandler({
      conversations: server.conversations,
      clientToolNames,
      context,
    }),
  );
  app.route("/", server.app);
  const transport = new DefaultChatTransport<UIMessage>({
    api: `${origin}/chat`,
    fetch: async (input, init) =>
      app.request(input instanceof Request ? input : String(input), init),
  });
  const history = async (id = chatId) => {
    const response = await app.request(`${origin}/chat/${id}/messages`);
    return {
      status: response.status,
      cacheControl: response.headers.get("Cache-Control"),
      messages:
        response.status === 200
          ? ((await response.json()) as UIMessage[])
          : undefined,
    };
  };
  const conversation = async () => {
    const opened = await server.conversations.acquire(chatId);
    if (opened === undefined) throw new Error(`No conversation ${chatId}.`);
    return opened;
  };
  return { transport, history, conversation };
};

const send = (transport: ChatTransport<UIMessage>, message: UIMessage) =>
  transport.sendMessages({
    trigger: "submit-message",
    chatId,
    messageId: undefined,
    messages: [message],
    abortSignal: undefined,
  });

const drain = async (stream: ReadableStream<UIMessageChunk>) => {
  const chunks: UIMessageChunk[] = [];
  const reader: ReadableStreamDefaultReader<UIMessageChunk> =
    stream.getReader();
  for (;;) {
    // Each read depends on the one before.
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(value);
  }
};

/** The message AI SDK's own reducer builds from `chunks`, as the panel does live. */
const reduce = async (chunks: readonly UIMessageChunk[]) => {
  let message: UIMessage | undefined;
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  for await (const next of readUIMessageStream({
    stream,
    terminateOnError: true,
  })) {
    message = next;
  }
  return message;
};

const entriesOf = async (chat: ReturnType<typeof openChat>) => {
  const { root } = await chat.conversation();
  return (await root.entries({ order: "ascending" }, 500, undefined, context))
    .items;
};

const entryOfKind = (entries: readonly EntryRecord[], kind: string) => {
  const entry = entries.find((candidate) => candidate.kind === kind);
  if (entry === undefined) throw new Error(`No ${kind} entry.`);
  return entry;
};

const userText = "Call the net Laundry line.";
const comments = [
  { id: "comment-1", records: ["N1"], quote: "a dryer", text: "Not a dryer." },
];

test("a reopened conversation's messages are the live stream's: the user's words, browser output from details, notes and comments as their own parts, prune writes hidden", async () => {
  const chat = openChat([
    fauxAssistantMessage(
      fauxToolCall(browserToolName, { title }, { id: toolCallId }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("I set the title."),
    fauxAssistantMessage("Noted."),
  ]);

  // A contextual body: the model reads the diagnostics envelope, the panel shows the words.
  const live = drain(
    await send(chat.transport, {
      id: "user-1",
      role: "user",
      parts: [
        {
          type: "text",
          text: petrinautContextualUserMessageBody({
            userText,
            diagnosticsContext: "No diagnostics.",
            submissionContext: { budget: "off" },
          }),
        },
      ],
    }),
  );

  // The browser claims the call; a hand edit reported meanwhile lands at the round's boundary, inside the response.
  let claimed;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { harness, root } = await chat.conversation();
    // eslint-disable-next-line no-await-in-loop
    const claim = await claimBrowserCall(harness, root.id, toolCallId, context);
    if (claim !== undefined) {
      claimed = { harness, root, claim };
      break;
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(5);
  }
  const { harness, root, claim } = claimed;
  await root.submit(
    handEditWrite(
      { binding: "net-1", episode: "e1", seq: 0, revision: "R2" },
      Date.now(),
    ),
    context,
  );
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
  const liveChunks = await live;
  const liveResponse = await reduce(liveChunks);

  // A prune write over the tool result, then a hand edit between turns.
  const toolResult = (await entriesOf(chat)).find(
    (entry) => entry.model?.[0]?.role === "toolResult",
  );
  const toolResultMessage = toolResult?.model?.[0];
  if (toolResult === undefined || toolResultMessage?.role !== "toolResult")
    throw new Error("No tool result entry.");
  await root.submit(
    {
      type: "write",
      requestId: `${pruneEntryKind}:test`,
      entry: {
        kind: pruneEntryKind,
        data: { assistant: toolResult.id },
        edits: [
          {
            target: toolResult.id,
            action: "replace",
            messages: [
              {
                ...toolResultMessage,
                content: [{ type: "text", text: "pruned" }],
              },
            ],
          },
        ],
      },
    },
    context,
  );
  await root.submit(
    handEditWrite(
      { binding: "net-1", episode: "e2", seq: 0, revision: "R3" },
      Date.now(),
    ),
    context,
  );

  // A Ledger-comment turn, as admission places it.
  const commentTurn = await root.submit(
    {
      type: "input",
      content: "<brunch.ledger-comments>…</brunch.ledger-comments>",
      entry: { kind: "brunch.ledger-comments", data: { comments } },
      requestId: "user-2",
    },
    context,
  );
  expect((await commentTurn.wait(context)).status).toBe("done");

  const entries = await entriesOf(chat);
  const userEntry = entryOfKind(entries, "brunch.user");
  const commentEntry = entryOfKind(entries, "brunch.ledger-comments");
  const notes = entries.filter(({ kind }) => kind === "brunch.hand-edit");
  expect(notes).toHaveLength(2);
  const [insideNote, betweenNote] = notes;

  const { status, cacheControl, messages } = await chat.history();
  expect(status).toBe(200);
  expect(cacheControl).toBe("no-store");
  expect(messages?.map(({ id, role }) => ({ id, role }))).toEqual([
    { id: `durable:user:${userEntry.id}`, role: "user" },
    { id: `durable:${userEntry.id}`, role: "assistant" },
    { id: `durable:user:${betweenNote?.id}`, role: "user" },
    { id: `durable:user:${commentEntry.id}`, role: "user" },
    { id: `durable:${commentEntry.id}`, role: "assistant" },
  ]);
  const [user, response, noteMessage, commentMessage, commentResponse] =
    messages ?? [];

  // The user's words, not the envelope the model read.
  expect(user?.parts).toEqual([
    { type: "text", text: userText, state: "done" },
  ]);

  // The live stream's message, ID and parts alike.
  expect(response).toEqual(liveResponse);
  expect(response?.parts.map(({ type }) => type)).toEqual([
    "step-start",
    `tool-${browserToolName}`,
    "data-brunch-hand-edit",
    "step-start",
    "text",
  ]);
  expect(response?.parts[1]).toMatchObject({
    state: "output-available",
    // From `details`, though the prune write replaced what the model reads.
    output: browserOutput,
  });
  expect(response?.parts[2]).toEqual({
    type: "data-brunch-hand-edit",
    id: `durable:note:${insideNote?.id}`,
    data: { episode: "e1", reportId: "e1:0", revision: "R2" },
  });
  expect(JSON.stringify(messages)).not.toContain("pruned");

  expect(noteMessage?.parts).toEqual([
    {
      type: "data-brunch-hand-edit",
      id: `durable:note:${betweenNote?.id}`,
      data: { episode: "e2", reportId: "e2:0", revision: "R3" },
    },
  ]);
  expect(commentMessage?.parts).toEqual([
    { type: "data-brunch-ledger-comments", data: { comments } },
  ]);
  expect(commentResponse?.parts).toEqual([
    { type: "step-start" },
    { type: "text", text: "Noted.", state: "done" },
  ]);
});

test("an envelope that does not parse shows as sent, and an unknown conversation is a 404 that creates nothing", async () => {
  const chat = openChat([fauxAssistantMessage("Hello.")]);
  expect((await chat.history()).status).toBe(404);
  expect((await chat.history()).status).toBe(404);

  const invalid = "petrinaut-contextual-user-message:v1\n{not json";
  const live = await drain(
    await send(chat.transport, {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: invalid }],
    }),
  );
  const { messages } = await chat.history();
  expect(messages?.[0]?.parts).toEqual([
    { type: "text", text: invalid, state: "done" },
  ]);
  expect(messages?.[1]).toEqual(await reduce(live));
  expect(messages).toHaveLength(2);
});
