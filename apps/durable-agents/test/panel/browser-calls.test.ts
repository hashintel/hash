/**
 * The Brunch panel's successor browser calls (`@hashintel/brunch-agent/client`)
 * against the durable agents server, in-process over SQLite: how a tab
 * claims, starts, runs and settles a call the server issued, how a second
 * tab takes or is refused it, and what a reloaded tab reads back.
 *
 * These tests build the server with `createDurableAgentsServer` and mount
 * the browser-call routes beside it, as `startDurableAgentsServer` does, but
 * with no HASH entry: the conversation and web headers arrive unchecked.
 */
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRegistry } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import {
  AbstractChat,
  type ChatInit,
  type ChatState,
  type ChatStatus,
  type ChatTransport,
  type UIMessage,
} from "ai";
import { afterEach, expect, test, vi } from "vitest";

import {
  brunchHeaders,
  canonicalContent,
  type BrowserContext,
} from "@hashintel/brunch-agent";
import {
  BrunchPanelConversationTracker,
  createBrunchSuccessorPanelTransport,
  createSuccessorBrowserCalls,
  readSuccessorBrowserCalls,
  successorEndpoints,
  type SuccessorConversation,
} from "@hashintel/brunch-agent/client";

import {
  browserCallExtension,
  browserToolName,
  callTtlMs,
} from "../../src/browser-call/browser-call";
import { createBrowserCallRouter } from "../../src/browser-call/browser-call-router";
import { createDurableAgentsServer } from "../../src/server/durable-agents-server";
import { browserCallsPrefix } from "../../src/server/start-durable-agents-server";
import { calls, context } from "../platform/support";
import { fauxAssistantMessage, scriptedModel } from "../scripted-model";

import type { OwnedStorage } from "../../src/server/conversation-storage";
import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";

type PanelTransport = ReturnType<typeof createBrunchSuccessorPanelTransport>;
type PanelMessage =
  PanelTransport extends ChatTransport<infer Message> ? Message : never;
type SuccessorBrowserCalls = ReturnType<typeof createSuccessorBrowserCalls>;
type Admission = Awaited<
  ReturnType<Parameters<typeof createSuccessorBrowserCalls>[0]["admit"]>
>;

const origin = "http://durable.test";
const conversationId = "net-1:construction";
const binding: BrowserContext["binding"] = {
  conversationId,
  documentId: "net-1",
};
const web = "web-1";
const titled = { ok: true, title: "Queue" };

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
  const directory = await mkdtemp(join(tmpdir(), "panel-browser-calls-"));
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

/** A promise and the function that resolves it. */
const gate = <Value = void>() => {
  let open: (value: Value) => void = () => {};
  const opened = new Promise<Value>((resolve) => {
    open = resolve;
  });
  return { open, opened };
};

type Request = {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  readonly credentials: RequestCredentials | undefined;
  readonly body: unknown;
  readonly status?: number;
};

/**
 * The server, whose model answers `responses` and calls `setNetTitle`, a
 * dynamic tool the browser runs, with the browser-call routes mounted where
 * the server serves them; and a connection to it that records every request
 * and its answer. `intercept` may answer a request in the server's place.
 */
const openServer = async (
  responses: FauxResponseStep[],
  {
    intercept,
  }: {
    readonly intercept?: (
      url: string,
      init: RequestInit | undefined,
      forward: () => Promise<Response>,
    ) => Promise<Response> | undefined;
  } = {},
) => {
  const clock = { now: Date.now() };
  const now = () => Math.max(clock.now, Date.now());
  const { models, model } = scriptedModel(responses);
  const server = createDurableAgentsServer({
    now,
    ...(await sqliteConversations()),
    createRegistry: () => {
      const registry = createRegistry();
      registry.install(browserCallExtension);
      return registry;
    },
    models,
    agent: { model },
    clientToolNames: new Set([browserToolName]),
    dynamicClientToolNames: new Set([browserToolName]),
    // As the production host does, a new conversation's browser calls are bound to the chat's binding.
    admitNewConversation: (body) => ({
      binding: body.binding as BrowserContext["binding"],
    }),
    context,
  });
  server.app.route(
    browserCallsPrefix,
    createBrowserCallRouter({
      resolveHarness: async (id) =>
        (await server.conversations.acquire(id))?.harness,
      now,
    }),
  );
  servers.push(server);
  const requests: Request[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    const request = {
      url,
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      credentials: init?.credentials,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    const forward = async () => server.app.request(url, init);
    try {
      const response = await (intercept?.(url, init, forward) ?? forward());
      requests.push({ ...request, status: response.status });
      return response;
    } catch (error) {
      requests.push(request);
      throw error;
    }
  };
  const conversation: SuccessorConversation = {
    endpoint: origin,
    actorKey: "test-actor",
    conversationId,
    web,
    fetch,
  };
  const endpoints = await successorEndpoints(conversation);
  /** The browser-call requests, by the route each names under the call. */
  const browserCallRequests = () =>
    requests.flatMap((request) =>
      request.url.startsWith(`${endpoints.browserCalls}/`)
        ? [
            {
              ...request,
              route:
                request.url
                  .slice(endpoints.browserCalls.length + 1)
                  .split("/")[1] ?? "claim",
            },
          ]
        : [],
    );
  return {
    clock,
    conversation,
    endpoints,
    requests,
    browserCallRequests,
  };
};

type Server = Awaited<ReturnType<typeof openServer>>;

/**
 * One tab's browser calls: it runs every call `admit` lets start through
 * `execute`, recording each run, and claims as `claimant`.
 */
const openTab = (
  server: Server,
  {
    claimant,
    admit = async () => ({ admitted: true }),
    execute = async () => titled,
    metadataFor = () => undefined,
  }: {
    readonly claimant: string;
    readonly admit?: () => Promise<Admission>;
    readonly execute?: (input: unknown) => Promise<unknown>;
    readonly metadataFor?: Parameters<
      typeof createSuccessorBrowserCalls
    >[0]["metadataFor"];
  },
) => {
  const executed: unknown[] = [];
  const browserCalls = createSuccessorBrowserCalls({
    conversation: server.conversation,
    binding,
    claimant,
    metadataFor,
    prepareInput: () => {},
    admit,
    acceptsRevision: () => true,
  });
  /** Run `toolCall` in band, as the panel's `onToolCall` does. */
  const run = (toolCall: {
    readonly toolCallId: string;
    readonly toolName: string;
    readonly input: unknown;
  }) =>
    browserCalls.run(
      { ...toolCall, signal: new AbortController().signal },
      async (input) => {
        executed.push(input);
        return execute(input);
      },
    );
  return { browserCalls, executed, run };
};

/** A chat on the conversation whose browser tool calls `tab` runs in band; none runs without one. */
const openChat = (server: Server, tab?: ReturnType<typeof openTab>) => {
  const runs: Promise<void>[] = [];
  const chat = new PanelChat({
    id: conversationId,
    transport: createBrunchSuccessorPanelTransport(
      server.conversation,
      new BrunchPanelConversationTracker(),
      { documentId: binding.documentId },
    ),
    onToolCall: ({ toolCall }) => {
      if (tab?.browserCalls.has(toolCall.toolName))
        runs.push(tab.run(toolCall));
    },
  });
  return { chat, runs };
};

const textOf = (message: UIMessage | undefined) =>
  (message?.parts ?? [])
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");

const titleCall = calls([browserToolName, "browser-1", { title: "Queue" }]);
const issuedCall = {
  toolCallId: "browser-1",
  toolName: browserToolName,
  input: { title: "Queue" },
};

/** Until the server has issued `browser-1`. */
const issued = async (server: Server) =>
  vi.waitFor(async () =>
    expect(
      (await readSuccessorBrowserCalls(server.conversation)).map(
        ({ toolCallId }) => toolCallId,
      ),
    ).toEqual(["browser-1"]),
  );

test("a browser call is claimed, started, run and settled, and the turn goes on with its result", async () => {
  const server = await openServer([titleCall, fauxAssistantMessage("Titled.")]);
  const tab = openTab(server, { claimant: "tab-1" });
  const { chat, runs } = openChat(server, tab);

  await chat.sendMessage({ text: "Name the net Queue." });
  await Promise.all(runs);

  expect(chat.error).toBeUndefined();
  expect(textOf(chat.messages.at(-1))).toBe("Titled.");
  expect(tab.executed).toEqual([{ title: "Queue" }]);
  const sent = server.browserCallRequests();
  expect(sent.map(({ route, status }) => [route, status])).toEqual([
    ["claim", 200],
    ["start", 200],
    ["result", 200],
  ]);
  expect(sent[0]?.body).toEqual({
    claimant: "tab-1",
    binding: canonicalContent(binding),
  });
  for (const request of sent) {
    expect(request.method).toBe("POST");
    expect(request.credentials).toBe("include");
    expect(request.headers.get(brunchHeaders.conversation)).toBe(
      conversationId,
    );
    expect(request.headers.get(brunchHeaders.web)).toBe(web);
  }
  expect(sent[2]?.body).toMatchObject({
    toolName: browserToolName,
    canonicalInput: { title: "Queue" },
    output: titled,
  });
});

test("a second tab takes a call until its holder starts it; after that, a tab is told it is open in another tab", async () => {
  const server = await openServer([titleCall, fauxAssistantMessage("Titled.")]);
  const approvalInFirst = gate<Admission>();
  const first = openTab(server, {
    claimant: "tab-1",
    admit: () => approvalInFirst.opened,
  });
  const { chat, runs } = openChat(server, first);
  const sent = chat.sendMessage({ text: "Name the net Queue." });
  await vi.waitFor(() =>
    expect(
      server.browserCallRequests().map(({ route, status }) => [route, status]),
    ).toEqual([["claim", 200]]),
  );

  // A reloaded or second tab takes the call while the first waits for approval.
  const executing = gate();
  const finish = gate();
  const second = openTab(server, {
    claimant: "tab-2",
    execute: async () => {
      executing.open();
      await finish.opened;
      return titled;
    },
  });
  const secondRun = second.run(issuedCall);
  await executing.opened;

  // Approved in the first tab, the call no longer starts there.
  approvalInFirst.open({ admitted: true });
  await Promise.all(runs);
  expect(first.executed).toEqual([]);
  expect(first.browserCalls.openInOtherTabs.getSnapshot()).toEqual(
    new Set(["browser-1"]),
  );

  // A third tab can't take a call that has started.
  const third = openTab(server, { claimant: "tab-3" });
  await third.run(issuedCall);
  expect(third.executed).toEqual([]);
  expect(third.browserCalls.openInOtherTabs.getSnapshot()).toEqual(
    new Set(["browser-1"]),
  );

  finish.open();
  await Promise.all([secondRun, sent]);
  expect(chat.error).toBeUndefined();
  expect(textOf(chat.messages.at(-1))).toBe("Titled.");
  expect(second.executed).toEqual([{ title: "Queue" }]);
  expect(second.browserCalls.openInOtherTabs.getSnapshot()).toEqual(new Set());
});

test("a result whose answer is lost after it committed is sent again and settles the call once", async () => {
  let lost = false;
  const server = await openServer(
    [titleCall, fauxAssistantMessage("Titled.")],
    {
      intercept: (url, init, forward) => {
        if (lost || !url.endsWith("/result")) return undefined;
        lost = true;
        // The server commits the result; the network drops its answer.
        return forward().then(() => {
          throw new TypeError("Failed to fetch");
        });
      },
    },
  );
  const tab = openTab(server, { claimant: "tab-1" });
  const { chat, runs } = openChat(server, tab);

  await chat.sendMessage({ text: "Name the net Queue." });
  await Promise.all(runs);

  expect(chat.error).toBeUndefined();
  expect(textOf(chat.messages.at(-1))).toBe("Titled.");
  expect(tab.executed).toHaveLength(1);
  const results = server
    .browserCallRequests()
    .filter(({ route }) => route === "result");
  // The first answer never arrived; the second is the server's receipt.
  expect(results.map(({ status }) => status)).toEqual([undefined, 200]);
  expect(results[1]?.body).toEqual(results[0]?.body);
  const [record] = await readSuccessorBrowserCalls(server.conversation);
  expect(record).toMatchObject({ status: "settled", output: titled });
});

test("a reloaded tab reads a settled call back with its output and metadata, and never runs it again", async () => {
  const server = await openServer([titleCall, fauxAssistantMessage("Titled.")]);
  const documentRevision = { before: "r-1", after: "r-2" };
  const tab = openTab(server, {
    claimant: "tab-1",
    metadataFor: () => ({ documentRevision }),
  });
  const { chat, runs } = openChat(server, tab);
  await chat.sendMessage({ text: "Name the net Queue." });
  await Promise.all(runs);

  // The reload replays the turn's stream, which delivers the call again.
  const reloaded = openTab(server, { claimant: "tab-2" });
  const before = server.browserCallRequests().length;
  await reloaded.run(issuedCall);

  expect(reloaded.executed).toEqual([]);
  expect(reloaded.browserCalls.openInOtherTabs.getSnapshot()).toEqual(
    new Set(),
  );
  expect(
    server
      .browserCallRequests()
      .slice(before)
      .map(({ route, status }) => [route, status]),
  ).toEqual([["claim", 409]]);
  expect(await readSuccessorBrowserCalls(server.conversation)).toEqual([
    expect.objectContaining({
      toolCallId: "browser-1",
      toolName: browserToolName,
      input: { title: "Queue" },
      status: "settled",
      output: titled,
      metadata: { documentRevision },
      admittable: false,
    }),
  ]);
});

test("a call past its deadline ends quietly: nothing runs and nothing is reported", async () => {
  const server = await openServer([titleCall, fauxAssistantMessage("Titled.")]);
  const tab = openTab(server, { claimant: "tab-1" });
  const { chat } = openChat(server);
  void chat.sendMessage({ text: "Name the net Queue." });
  await issued(server);
  const [record] = await readSuccessorBrowserCalls(server.conversation);
  expect(record).toMatchObject({ admittable: true });
  expect(record?.expiresAt).toBeGreaterThan(Date.now() + callTtlMs - 60_000);

  server.clock.now = Date.now() + callTtlMs + 1;
  await expect(tab.run(issuedCall)).resolves.toBeUndefined();

  expect(tab.executed).toEqual([]);
  expect(tab.browserCalls.openInOtherTabs.getSnapshot()).toEqual(new Set());
  expect(
    server
      .browserCallRequests()
      .filter(({ url }) => url.includes("/browser-1"))
      .map(({ route, status }) => [route, status]),
  ).toEqual([["claim", 409]]);
});
