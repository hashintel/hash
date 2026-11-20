/**
 * The Brunch panel reopening a conversation on the durable agents server,
 * in-process over SQLite: the history `GET /chat/:id/messages` answers,
 * through the panel's reader and its snapshot adapter
 * (`@hashintel/brunch-agent/client`), folds to the Ledger the conversation
 * recorded, and a tab that reopens mid-turn follows the running turn once.
 *
 * The server is built with `createDurableAgentsServer`, with the HASH agent's
 * Ledger extension over each Harness's host binding as
 * `startDurableAgentsServer` composes it; no host middleware runs, so the
 * conversation and web headers arrive unchecked.
 */
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRegistry, defineExtension } from "@earendil-works/pi-durable";
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
  brunchTools,
  flueConversationIdWeb,
  foldCommits,
  latestLedgerTurnId,
  ledgerCommentsMessage,
} from "@hashintel/brunch-agent";
import {
  BrunchPanelConversationTracker,
  createBrunchSuccessorPanelTransport,
  readSuccessorHistory,
  reopenSuccessorConversation,
  type SuccessorConversation,
} from "@hashintel/brunch-agent/client";

import {
  browserCallExtension,
  browserToolName,
} from "../../src/browser-call/browser-call";
import { createLedgerExtension, foldLedger, LedgerDoc } from "../../src/ledger";
import { createDurableAgentsServer } from "../../src/server/durable-agents-server";
import { calls, context, fauxToolCall, holdTool } from "../platform/support";
import { fauxAssistantMessage, scriptedModel } from "../scripted-model";

import type { OwnedStorage } from "../../src/server/conversation-storage";
import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";
import type { JsonObject } from "@earendil-works/pi-durable";

type PanelTransport = ReturnType<typeof createBrunchSuccessorPanelTransport>;
type PanelMessage =
  PanelTransport extends ChatTransport<infer Message> ? Message : never;
type LedgerState = ReturnType<typeof foldCommits>["state"];

const origin = "http://durable.test";
const conversationId = "net-1:construction";
const documentId = "net-1";

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

/** Each conversation in its own SQLite file under `directory`, owned by this one process. */
const sqliteConversations = (directory: string) => {
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
 * A server over the conversations in `directory`, whose model answers
 * `responses` and may call the Ledger's tools and `tools`; and the panel's
 * connection to it.
 */
const openServer = async (
  directory: string,
  responses: FauxResponseStep[],
  tools: readonly ReturnType<typeof holdTool>["tool"][] = [],
) => {
  const { models, model } = scriptedModel(responses);
  const server = createDurableAgentsServer({
    now: Date.now,
    ...sqliteConversations(directory),
    createRegistry: (host) => {
      const registry = createRegistry();
      registry.install(browserCallExtension);
      registry.install(createLedgerExtension(host));
      registry.install(
        defineExtension({ name: "test.held", tools: [...tools] }),
      );
      return registry;
    },
    models,
    agent: { model },
    clientToolNames: new Set([browserToolName]),
    dynamicClientToolNames: new Set([browserToolName]),
    context,
  });
  servers.push(server);
  const conversation: SuccessorConversation = {
    endpoint: origin,
    actorKey: "test-actor",
    conversationId,
    web: "web-1",
    fetch: async (input, init) =>
      server.app.request(
        input instanceof Request ? input.url : input.toString(),
        init,
      ),
  };
  /** A panel tab's chat on the conversation, opened on `messages`. */
  const openChat = (messages: PanelMessage[] = []) => {
    const transport = createBrunchSuccessorPanelTransport(
      conversation,
      new BrunchPanelConversationTracker(),
      { documentId },
    );
    return new PanelChat({ id: conversationId, messages, transport });
  };
  /** The conversation as a tab opening now reads it: its history, through the panel's adapter. */
  const reopen = async () => {
    const history = await readSuccessorHistory(conversation);
    if (!history.found) throw new Error("The server has no conversation.");
    return reopenSuccessorConversation(history.messages, { conversationId });
  };
  /** The Ledger the server itself recorded for the conversation. */
  const storedLedger = async () => {
    const open = await server.conversations.acquire(
      await flueConversationIdWeb(conversation),
    );
    if (open === undefined) throw new Error("The server has no conversation.");
    return foldLedger(
      await open.harness.snapshot(LedgerDoc, open.root.id, context),
    );
  };
  return { server, openChat, reopen, storedLedger };
};

const textOf = (message: UIMessage | undefined) =>
  (message?.parts ?? [])
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");

/** `state` with each turn's ID replaced by its place among the turns, so Ledgers keyed by different IDs compare. */
const numberTurns = (state: LedgerState) =>
  state.turns.reduce(
    (json, { id }, index) =>
      json.replaceAll(JSON.stringify(id), JSON.stringify(`turn-${index}`)),
    JSON.stringify(state),
  );

const dryer = {
  name: "Dryer",
  kind: "resource",
  origin: "stated",
  status: "confirmed",
};
const comments = [{ id: "n1", records: ["e1"], text: "It is a tumble dryer." }];

/** The turns of the conversation reopened: a commit, then a comment the next commit resolves. */
const ledgerTurns: FauxResponseStep[] = [
  calls([
    brunchTools.ledgerCommit,
    "commit-1",
    { entries: [["entity/create", dryer]] } as JsonObject,
  ]),
  fauxAssistantMessage("Recorded the dryer."),
  calls([
    brunchTools.ledgerCommit,
    "commit-2",
    {
      entries: [
        [
          "claim/create",
          {
            text: "The dryer tumbles.",
            entities: ["e1"],
            origin: "stated",
            status: "confirmed",
            resolves: ["n1"],
          },
        ],
      ],
    } as JsonObject,
  ]),
  fauxAssistantMessage("Noted."),
];

test("a reopened panel folds the conversation's history to the Ledger it showed before, the one the server recorded", async () => {
  const directory = await mkdtemp(join(tmpdir(), "panel-history-"));
  directories.push(directory);
  const before = await openServer(directory, ledgerTurns);
  const chat = before.openChat();
  await chat.sendMessage({ text: "Model a dryer." });
  await chat.sendMessage({ text: ledgerCommentsMessage(comments).body });
  expect(chat.error).toBeUndefined();

  const shown = await before.reopen();
  const ledgerShown = foldCommits(shown.snapshot);
  const stored = await before.storedLedger();
  await before.server.close();

  // A server started afresh over the same conversations, as after a deploy.
  const after = await openServer(directory, []);
  const reopened = await after.reopen();
  const ledgerReopened = foldCommits(reopened.snapshot);

  expect(ledgerReopened.rejected).toEqual([]);
  expect(ledgerReopened.state).toEqual(ledgerShown.state);
  expect(ledgerReopened.revision).toBe(ledgerShown.revision);
  expect(ledgerReopened.state.entities).toMatchObject([{ name: "Dryer" }]);
  expect(ledgerReopened.state.comments).toMatchObject([
    { id: "n1", resolvedBy: "c1" },
  ]);
  // The server keys its turns by entry, the panel by the request that opened each.
  const userMessageIds = chat.messages
    .filter(({ role }) => role === "user")
    .map(({ id }) => id);
  expect(ledgerReopened.state.turns.map(({ id }) => id)).toEqual(
    userMessageIds,
  );
  expect(latestLedgerTurnId(reopened.snapshot)).toBe(userMessageIds.at(-1));
  expect(numberTurns(ledgerReopened.state)).toBe(numberTurns(stored.state));
  expect(ledgerReopened.revision).toBe(stored.revision);

  // The reopened chat shows what the open one did, comments as their body.
  expect(
    reopened.messages.map((message) => ({
      id: message.id,
      role: message.role,
      text: textOf(message),
    })),
  ).toEqual(
    chat.messages.map((message) => ({
      id: message.id,
      role: message.role,
      text: textOf(message),
    })),
  );
  // The history settles a turn a later one followed; the last waits on an ending a panel saw.
  expect(
    reopened.snapshot.settlements.map(({ submissionId }) => submissionId),
  ).toEqual(userMessageIds.slice(0, 1));
});

test("a tab reopened on the history mid-turn follows the running turn once, over the history's copy of it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "panel-history-"));
  directories.push(directory);
  const held = holdTool("check");
  const panel = await openServer(
    directory,
    [
      fauxAssistantMessage(
        [
          { type: "text", text: "Checking." },
          fauxToolCall("check", {}, { id: "check-1" }),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage("Checked."),
    ],
    [held.tool],
  );
  const first = panel.openChat();
  const sent = first.sendMessage({ text: "Check the dryer." });
  await held.started;

  const reopened = await panel.reopen();
  expect(reopened.messages.map(({ role }) => role)).toEqual([
    "user",
    "assistant",
  ]);
  expect(textOf(reopened.messages[1])).toBe("Checking.");
  // The running turn is unsettled, so the panel would not replace its chat with this snapshot.
  expect(reopened.snapshot.settlements).toEqual([]);
  const second = panel.openChat(reopened.messages);
  const resumed = second.resumeStream();
  await vi.waitFor(() =>
    expect(second.status).toMatch(/^(submitted|streaming)$/u),
  );
  held.release();
  await Promise.all([sent, resumed]);

  for (const chat of [first, second]) {
    expect(chat.error).toBeUndefined();
    expect(chat.messages.map(({ role }) => role)).toEqual([
      "user",
      "assistant",
    ]);
    const parts = chat.messages[1]?.parts ?? [];
    expect(
      parts.filter(({ type }) => type === `tool-${held.tool.name}`),
    ).toHaveLength(1);
    expect(textOf(chat.messages[1])).toBe("Checking.Checked.");
  }
  expect(second.messages[1]?.id).toBe(first.messages[1]?.id);
});
