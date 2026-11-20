/**
 * The Brunch panel's transport (`@hashintel/brunch-agent/client`) against the
 * durable agents server, in-process over SQLite: what each request carries,
 * and how a turn streams, resumes, stops and retries as the panel's chat
 * sees it.
 *
 * These tests build the server with `createDurableAgentsServer`, not
 * `startDurableAgentsServer`, so no host middleware runs: the conversation
 * header, the web header and the binding arrive unchecked.
 */
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { createRegistry, defineExtension } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import {
  AbstractChat,
  type ChatInit,
  type ChatState,
  type ChatStatus,
  type ChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { afterEach, expect, test, vi } from "vitest";

import { brunchTools, flueConversationIdWeb } from "@hashintel/brunch-agent";
import {
  BrunchPanelConversationTracker,
  createBrunchSuccessorPanelTransport,
  requestSuccessorStop,
  successorEndpoints,
  type SuccessorConversation,
} from "@hashintel/brunch-agent/client";
import { petrinautDiagnosticsContextMessageId } from "@hashintel/petrinaut-core";

import {
  browserCallExtension,
  browserToolName,
  claimBrowserCall,
  finishBrowserCall,
} from "../../src/browser-call/browser-call";
import { createDurableAgentsServer } from "../../src/server/durable-agents-server";
import { calls, context, holdTool } from "../platform/support";
import { fauxAssistantMessage, scriptedModel } from "../scripted-model";

import type { OwnedStorage } from "../../src/server/conversation-storage";
import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";

type PanelTransport = ReturnType<typeof createBrunchSuccessorPanelTransport>;
type PanelMessage =
  PanelTransport extends ChatTransport<infer Message> ? Message : never;

const origin = "http://durable.test";
const actorKey = "test-actor";
const conversationId = "net-1:construction";
const documentId = "net-1";
const web = "web-1";

const servers: { close: () => Promise<void> }[] = [];
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

/** `ChatState` over a plain array, as `@ai-sdk/react` keeps one in a ref. */
class ArrayChatState<Message extends UIMessage> implements ChatState<Message> {
  public status: ChatStatus = "ready";
  public error: Error | undefined = undefined;
  public messages: Message[];
  public constructor(messages: Message[]) {
    this.messages = messages;
  }
  public pushMessage = (message: Message) => {
    this.messages = [...this.messages, message];
  };
  public popMessage = () => {
    this.messages = this.messages.slice(0, -1);
  };
  public replaceMessage = (index: number, message: Message) => {
    this.messages = this.messages.with(index, message);
  };
  public snapshot = <Value>(value: Value): Value => structuredClone(value);
}

/** AI SDK's chat, as the panel's `useChat` drives it, without React. */
class PanelChat extends AbstractChat<PanelMessage> {
  public constructor({
    messages = [],
    ...init
  }: ChatInit<PanelMessage> & { readonly messages?: PanelMessage[] }) {
    super({ ...init, state: new ArrayChatState(messages) });
  }
}

/** Each conversation in its own SQLite file, owned by this one process. */
const sqliteConversations = async () => {
  const directory = await mkdtemp(join(tmpdir(), "panel-chat-transport-"));
  directories.push(directory);
  const fileOf = (id: string) => join(directory, `${id}.sqlite`);
  const opened = new Map<string, Promise<OwnedStorage>>();
  return {
    openStorage: (id: string): Promise<OwnedStorage> => {
      const existing = opened.get(id);
      if (existing !== undefined) return existing;
      const storage = openNodeSqliteStorage(fileOf(id)).then((sqlite) =>
        Object.assign(sqlite, { isOwner: async () => true }),
      );
      opened.set(id, storage);
      return storage;
    },
    storageExists: (id: string) =>
      access(fileOf(id)).then(
        () => true,
        () => false,
      ),
  };
};

/**
 * The server, whose model answers `responses` and may call `tools` beside
 * `setNetTitle`, which streams as a dynamic tool the browser runs; and the
 * panel's connection to it, recording every request body it sends.
 */
const openPanel = async (
  responses: FauxResponseStep[],
  tools: readonly ReturnType<typeof holdTool>["tool"][] = [],
) => {
  const { models, model } = scriptedModel(responses);
  const server = createDurableAgentsServer({
    now: Date.now,
    ...(await sqliteConversations()),
    createRegistry: () => {
      const registry = createRegistry();
      registry.install(browserCallExtension);
      registry.install(defineExtension({ name: "ledger", tools: [...tools] }));
      return registry;
    },
    models,
    agent: { model },
    clientToolNames: new Set([browserToolName]),
    dynamicClientToolNames: new Set([browserToolName]),
    context,
  });
  servers.push(server);
  const requests: { url: string; method: string; body: unknown }[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    requests.push({
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return server.app.request(url, init);
  };
  const conversation: SuccessorConversation = {
    endpoint: origin,
    actorKey,
    conversationId,
    web,
    fetch,
  };
  const instanceId = await flueConversationIdWeb(conversation);
  const endpoints = await successorEndpoints(conversation);
  /** A panel tab's chat on the conversation, with its own tracker. */
  const openChat = (messages: PanelMessage[] = []) => {
    const tracker = new BrunchPanelConversationTracker();
    const transport = createBrunchSuccessorPanelTransport(
      conversation,
      tracker,
      { documentId },
    );
    const chat = new PanelChat({
      id: conversationId,
      messages,
      transport,
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    });
    return { chat, tracker, transport };
  };
  const chatPosts = () =>
    requests.filter(
      ({ url, method }) => method === "POST" && url === endpoints.chat,
    );
  return {
    server,
    conversation,
    instanceId,
    endpoints,
    fetch,
    openChat,
    chatPosts,
  };
};

const textOf = (message: UIMessage | undefined) =>
  (message?.parts ?? [])
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");

const lastMessage = (chat: PanelChat) => chat.messages.at(-1);

/** The panel's body as the server read it: one user message, and the binding. */
const expectPanelBody = (body: unknown) => {
  expect(body).toMatchObject({
    trigger: "submit-message",
    messages: [{ role: "user" }],
    binding: { conversationId, documentId },
  });
  const { messages } = body as { messages: unknown[] };
  expect(messages).toHaveLength(1);
  expect(JSON.stringify(body)).not.toContain(
    petrinautDiagnosticsContextMessageId,
  );
};

/** Claim and finish `toolCallId`'s browser call as the panel's in-band call does. */
const actAsBrowser = async (
  server: Awaited<ReturnType<typeof openPanel>>["server"],
  instanceId: string,
  toolCallId: string,
  output: Parameters<typeof finishBrowserCall>[1]["output"],
) => {
  for (;;) {
    // eslint-disable-next-line no-await-in-loop -- Each try follows the last.
    const open = await server.conversations.acquire(instanceId);
    if (open !== undefined) {
      const { harness, root } = open;
      // eslint-disable-next-line no-await-in-loop -- Each try follows the last.
      const claim = await claimBrowserCall(
        harness,
        root.id,
        toolCallId,
        context,
        Date.now,
      );
      if (claim !== undefined)
        return finishBrowserCall(
          harness,
          {
            conversationId: root.id,
            toolCallId,
            toolName: claim.toolName,
            capability: claim.capability,
            canonicalInput: claim.input,
            output,
          },
          context,
          Date.now,
        );
    }
    // The tool task issues the call after its assistant entry commits.
    // eslint-disable-next-line no-await-in-loop -- Each try follows the last.
    await sleep(5);
  }
};

/** Every chunk of a stream, to its end. */
const drain = async (stream: ReadableStream<UIMessageChunk>) => {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    // eslint-disable-next-line no-await-in-loop -- Each read follows the last.
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(value);
  }
};

test("a first message creates the conversation under its instance ID and streams the answer", async () => {
  const panel = await openPanel([fauxAssistantMessage("A queue it is.")]);
  const { chat } = panel.openChat();

  await chat.sendMessage({ text: "Model a queue." });

  expect(chat.error).toBeUndefined();
  expect(chat.messages.map(({ role }) => role)).toEqual(["user", "assistant"]);
  expect(textOf(lastMessage(chat))).toBe("A queue it is.");
  const created = await panel.server.conversations.acquire(panel.instanceId);
  expect(created?.root.id).toBeDefined();
  const [post] = panel.chatPosts();
  expectPanelBody(post?.body);
  expect(post?.body).toMatchObject({ id: panel.instanceId });
});

test("a reconnect mid-turn shows the running turn once, over the history's copy of it", async () => {
  const commit = holdTool(brunchTools.ledgerCommit);
  const panel = await openPanel(
    [
      calls([brunchTools.ledgerCommit, "commit-1"]),
      fauxAssistantMessage("Committed."),
    ],
    [commit.tool],
  );
  const first = panel.openChat();
  const sent = first.chat.sendMessage({ text: "Record the queue." });
  await commit.started;

  // A second tab opens on the conversation's history, then follows the turn.
  const history = (await (
    await panel.fetch(panel.endpoints.messages)
  ).json()) as PanelMessage[];
  const second = panel.openChat(history);
  const resumed = second.chat.resumeStream();
  await vi.waitFor(() =>
    expect(second.chat.status).toMatch(/^(submitted|streaming)$/u),
  );
  commit.release();
  await Promise.all([sent, resumed]);

  for (const { chat } of [first, second]) {
    expect(chat.error).toBeUndefined();
    expect(chat.messages.map(({ role }) => role)).toEqual([
      "user",
      "assistant",
    ]);
    const parts = lastMessage(chat)?.parts ?? [];
    expect(
      parts.filter(({ type }) => type === `tool-${brunchTools.ledgerCommit}`),
    ).toHaveLength(1);
    expect(textOf(lastMessage(chat))).toBe("Committed.");
  }
  expect(lastMessage(second.chat)?.id).toBe(lastMessage(first.chat)?.id);
  expect(panel.chatPosts()).toHaveLength(1);
});

test("a retry after stop runs a new turn, while the stopped message replays its abort", async () => {
  const panel = await openPanel([
    calls([browserToolName, "browser-1", { title: "Queue" }]),
    fauxAssistantMessage("Second try."),
  ]);
  const { chat, tracker, transport } = panel.openChat();
  const sent = chat.sendMessage({ text: "Name the net Queue." });
  // The turn waits on the browser call, which the panel never runs here.
  await vi.waitFor(() =>
    expect(lastMessage(chat)?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "dynamic-tool" }),
      ]),
    ),
  );

  await expect(requestSuccessorStop(panel.conversation, tracker)).resolves.toBe(
    "stop-requested",
  );
  await sent;
  const stopped = chat.messages[0];

  // The panel's retry sends the prompt again under a new message ID.
  await chat.sendMessage({ text: "Name the net Queue." });

  expect(textOf(lastMessage(chat))).toBe("Second try.");
  const posts = panel.chatPosts();
  expect(posts).toHaveLength(2);
  for (const { body } of posts) expectPanelBody(body);
  const [stoppedId, retriedId] = posts.map(
    ({ body }) => (body as { messages: [{ id: string }] }).messages[0].id,
  );
  expect(stoppedId).toBe(stopped?.id);
  expect(retriedId).not.toBe(stoppedId);

  // Sent again, the stopped message follows its own submission: its abort.
  const replayed = await drain(
    await transport.sendMessages({
      trigger: "submit-message",
      chatId: conversationId,
      messageId: undefined,
      messages: [stopped!],
      abortSignal: undefined,
    }),
  );
  expect(replayed.at(-1)).toMatchObject({ type: "abort" });
});

test("no request carries the diagnostics message the panel keeps in its chat", async () => {
  const panel = await openPanel([fauxAssistantMessage("Noted.")]);
  const diagnostics = {
    id: petrinautDiagnosticsContextMessageId,
    role: "user",
    parts: [{ type: "text", text: "Petrinaut diagnostics context only." }],
  } as PanelMessage;
  const { chat } = panel.openChat([diagnostics]);

  await chat.sendMessage({ text: "Model a queue." });

  expect(textOf(lastMessage(chat))).toBe("Noted.");
  const posts = panel.chatPosts();
  expect(posts).toHaveLength(1);
  expectPanelBody(posts[0]?.body);
});

test("a browser tool streams as a dynamic part and a server tool as one the server ran, neither owed by the panel", async () => {
  const commit = holdTool(brunchTools.ledgerCommit);
  commit.release();
  const panel = await openPanel(
    [
      calls(
        [brunchTools.ledgerCommit, "commit-1"],
        [browserToolName, "browser-1", { title: "Queue" }],
      ),
      fauxAssistantMessage("Titled."),
    ],
    [commit.tool],
  );
  const { chat } = panel.openChat();
  const sent = chat.sendMessage({ text: "Name the net Queue." });

  await vi.waitFor(() =>
    expect(lastMessage(chat)?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "dynamic-tool",
          toolName: browserToolName,
          toolCallId: "browser-1",
          state: "input-available",
        }),
      ]),
    ),
  );
  expect(lastMessage(chat)?.parts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: `tool-${brunchTools.ledgerCommit}`,
        toolCallId: "commit-1",
        providerExecuted: true,
      }),
    ]),
  );
  expect(
    lastAssistantMessageIsCompleteWithToolCalls({ messages: chat.messages }),
  ).toBe(false);

  await actAsBrowser(panel.server, panel.instanceId, "browser-1", {
    ok: true,
    title: "Queue",
  });
  await sent;

  expect(chat.error).toBeUndefined();
  expect(textOf(lastMessage(chat))).toBe("Titled.");
  expect(
    lastAssistantMessageIsCompleteWithToolCalls({ messages: chat.messages }),
  ).toBe(false);
  // The server continued the turn itself; the panel sent nothing more.
  expect(panel.chatPosts()).toHaveLength(1);
});
