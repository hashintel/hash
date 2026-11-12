/**
 * The fold redesign's two invariants (`fold-redesign.md`, "Proof
 * obligations"), through the server as `startDurableAgentsServer` wires it:
 * `createDurableAgentsServer` with the Petrinaut agent's extensions installed
 * over each Harness's host binding, the browser-call routes beside it, chat
 * through AI SDK's own transport and hand edits through their route. Memory
 * storage stands in for Postgres, a faux model for the provider, and a
 * scripted browser claims and answers the calls.
 *
 * - I1: every model request equals the committed effective context at its
 *   cutoff, `context({ at })` as of the newest entry before its answer, which
 *   holds the stored section contributions. Nothing rewrites a request.
 * - I2: every revision a change is issued against is backed by a net view
 *   present in that request's own messages: a complete read, a complete
 *   read-back or the `net_view` section. An independent oracle reads only the
 *   messages' content; a call it finds no current view for was refused, with
 *   nothing recorded. A details-only revision (a change that reported a new
 *   revision but no read-back) is never credited.
 *
 * One conversation covers a turn with reads and changes, a pruning round, a
 * hand-edit note, and a compaction whose baseline carries the section.
 */
import { setTimeout as sleep } from "node:timers/promises";

import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
  type FauxResponseFactory,
  type FauxResponseStep,
} from "@earendil-works/pi-ai/providers/faux";
import {
  CompactionEntry,
  type CompactionPolicy,
  type Conversation,
  type ConversationId,
  createRegistry,
  type EntryRecord,
  type Harness,
  MemoryStorage,
  type ModelRef,
} from "@earendil-works/pi-durable";
import { DefaultChatTransport, type UIMessage } from "ai";
import { afterEach, expect, test } from "vitest";

import { browserToolFacts } from "@hashintel/brunch-agent";

import { createPetrinautAgent } from "../../../src/agent/petrinaut-agent";
import { pruneEntryKind } from "../../../src/agent/petrinaut-agent/read-back-pruning";
import {
  bindBrowserDocument,
  BrowserBindingDoc,
  BrowserCallsDoc,
  claimBrowserCall,
  finishBrowserCall,
} from "../../../src/browser-call/browser-call";
import { createBrowserCallRouter } from "../../../src/browser-call/browser-call-router";
import { petrinautBrowserTools } from "../../../src/browser-call/petrinaut-browser-tools";
import {
  noNetViewRefusal,
  staleNetViewRefusal,
} from "../../../src/net-state/net-freshness";
import { createDurableAgentsServer } from "../../../src/server/durable-agents-server";
import { browserCallsPrefix } from "../../../src/server/start-durable-agents-server";
import { drain } from "../server";
import { allEntries, calls, context, textOf } from "../support";

import type { OwnedStorage } from "../../../src/server/conversation-storage";
import type { JsonValue } from "@earendil-works/chord";
import type { AssistantMessage, Message } from "@earendil-works/pi-ai";

const origin = "http://durable.test";
const chatId = "chat-invariants";
const binding = { conversationId: chatId, documentId: "net-1" };

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

// ─── The faux model ──────────────────────────────────────────────────────────

const summarizerPrompt = "You are a context summarization assistant.";

const isSummarization = (messages: readonly Message[]) => {
  const [first] = messages;
  return (
    first?.role === "system" &&
    typeof first.content === "string" &&
    first.content.startsWith(summarizerPrompt)
  );
};

/**
 * Conversation requests are recorded and answered from a queue;
 * summarization requests are answered apart, with a summary that holds no
 * net view.
 */
const scriptedModel = () => {
  const requests: Message[][] = [];
  const queue: FauxResponseStep[] = [];
  const faux = fauxProvider({
    models: [{ id: "invariants", contextWindow: 128_000, maxTokens: 4096 }],
  });
  const respond: FauxResponseFactory = async (
    requestContext,
    ...rest
  ): Promise<AssistantMessage> => {
    const messages = structuredClone(requestContext.messages);
    if (isSummarization(messages))
      return fauxAssistantMessage("## Goal\nModel a laundry.");
    requests.push(messages);
    const step = queue.shift();
    if (step === undefined) throw new Error("The script is empty.");
    return typeof step === "function" ? step(requestContext, ...rest) : step;
  };
  faux.setResponses(Array.from({ length: 100 }, () => respond));
  const models = createModels();
  models.setProvider(faux.provider);
  const model: ModelRef = {
    provider: faux.provider.id,
    modelId: faux.getModel().id,
  };
  return {
    models,
    model,
    requests,
    script: (...steps: FauxResponseStep[]) => {
      queue.push(...steps);
    },
  };
};

// ─── The server ──────────────────────────────────────────────────────────────

/** The server as `startDurableAgentsServer` wires it, over memory. */
const openServer = () => {
  const model = scriptedModel();
  const compaction: CompactionPolicy = {
    enabled: false,
    keepRecentTokens: 1,
    reserveTokens: 16_384,
    backgroundTokens: 0,
  };
  const stores = new Map<string, OwnedStorage>();
  const { agent, extensions } = createPetrinautAgent();
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
    createRegistry: (host) => {
      const registry = createRegistry();
      for (const extension of extensions(host)) registry.install(extension);
      return registry;
    },
    models: model.models,
    agent: { ...agent, model: model.model },
    settings: () => ({ compaction }),
    clientToolNames: new Set(petrinautBrowserTools.map(({ name }) => name)),
    context,
  });
  server.app.route(
    browserCallsPrefix,
    createBrowserCallRouter({
      resolveHarness: async (conversationId) =>
        (await server.conversations.acquire(conversationId))?.harness,
    }),
  );
  closers.push(() => server.close());
  const transport = new DefaultChatTransport<UIMessage>({
    api: `${origin}/chat`,
    fetch: async (input, init) =>
      server.app.request(
        input instanceof Request ? input : String(input),
        init,
      ),
  });
  const conversation = async () => {
    const open = await server.conversations.acquire(chatId);
    if (open === undefined) throw new Error(`No conversation ${chatId}.`);
    return open;
  };
  let sent = 0;
  /** One chat message, streamed to its end, and the conversation idle after it. */
  const ask = async (text: string) => {
    sent += 1;
    const chunks = await drain(
      await transport.sendMessages({
        trigger: "submit-message",
        chatId,
        messageId: undefined,
        messages: [
          { id: `user-${sent}`, role: "user", parts: [{ type: "text", text }] },
        ],
        abortSignal: undefined,
      }),
    );
    expect(chunks.at(-1)).toEqual({ type: "finish", finishReason: "stop" });
    await (await conversation()).root.waitForIdle(context);
  };
  /** The panel's hand-edit report, through its route. */
  const reportHandEdit = async (revision: string, episode: string) => {
    const { harness, root } = await conversation();
    const bound = await harness.snapshot(BrowserBindingDoc, root.id, context);
    const response = await server.app.request(
      `${browserCallsPrefix}/${chatId}/browser-calls/hand-edits`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          binding: bound?.binding,
          episode,
          seq: 0,
          revision,
        }),
      },
    );
    expect(response.ok).toBe(true);
  };
  const compact = async () => {
    const { harness, root } = await conversation();
    const task = await root.compact(undefined, context);
    expect(
      (await harness.waitForTask(task, context)).state.outcome,
    ).toMatchObject({ status: "completed" });
  };
  return { server, model, ask, conversation, reportHandEdit, compact };
};

// ─── The scripted browser ────────────────────────────────────────────────────

type BrowserAnswer = {
  readonly output: JsonValue;
  readonly metadata: JsonValue;
};

const definitionAt = (revision: string) => ({
  places: [{ id: "place-dryer", name: "Dryer" }],
  transitions: [],
  revision,
});

const read = (revision: string): BrowserAnswer => ({
  output: { title: "Laundry", definition: definitionAt(revision) },
  metadata: { documentRevision: { before: revision } },
});
const changed = (before: string, after: string): BrowserAnswer => ({
  output: { applied: true },
  metadata: {
    documentRevision: { before, after },
    readBack: definitionAt(after),
  },
});
/** A change that names its new revision in metadata, which reaches only `details`, with no read-back. */
const detailsOnly = (before: string, after: string): BrowserAnswer => ({
  output: { applied: true },
  metadata: { documentRevision: { before, after } },
});

/** A browser that claims each pending call it has an answer for, and answers it. */
const scriptedBrowser = (
  harness: Harness,
  conversationId: ConversationId,
  answers: ReadonlyMap<string, BrowserAnswer>,
) => {
  const answered = new Set<string>();
  const state = { stopped: false };
  const running = (async () => {
    while (!state.stopped) {
      // eslint-disable-next-line no-await-in-loop -- A poll, one at a time.
      const doc = await harness.snapshot(
        BrowserCallsDoc,
        conversationId,
        context,
      );
      for (const record of Object.values(doc?.calls ?? {})) {
        const answer = answers.get(record.toolCallId);
        if (
          record.status !== "pending" ||
          answer === undefined ||
          answered.has(record.toolCallId)
        )
          continue;
        answered.add(record.toolCallId);
        // eslint-disable-next-line no-await-in-loop -- The browser answers one call at a time.
        const claim = await claimBrowserCall(
          harness,
          conversationId,
          record.toolCallId,
          context,
        );
        if (claim === undefined)
          throw new Error(`${record.toolCallId} was not claimable.`);
        // eslint-disable-next-line no-await-in-loop -- As above.
        await finishBrowserCall(
          harness,
          {
            conversationId,
            toolCallId: record.toolCallId,
            toolName: claim.toolName,
            capability: claim.capability,
            canonicalInput: claim.input,
            output: answer.output,
            metadata: answer.metadata,
          },
          context,
        );
      }
      // eslint-disable-next-line no-await-in-loop -- Polling interval.
      await sleep(2);
    }
  })();
  return {
    stop: async () => {
      state.stopped = true;
      await running;
    },
  };
};

// ─── The oracle: what the request's own messages show ────────────────────────

type OracleView =
  | { readonly state: "none" }
  | { readonly state: "stale" }
  | { readonly state: "current"; readonly revision: string };

/** The only net read this script calls; changes must carry their read-back. */
const readToolName = "getLatestNetDefinition";
const sectionBlock = /<net-view revision="([^"]+)">[\s\S]*<\/net-view>/u;
const noteBlock = /<hand-edit revision="([^"]+)">/u;

const contentTexts = (message: Message): string[] =>
  typeof message.content === "string"
    ? [message.content]
    : message.content.flatMap((part) =>
        part.type === "text" ? [part.text] : [],
      );

/** The revision a successful tool result's content shows the whole net at, if any. */
const toolViewRevision = (message: Message): string | undefined => {
  if (message.role !== "toolResult" || message.isError) return undefined;
  const [first, ...rest] = contentTexts(message);
  if (first === undefined || rest.some((text) => text.includes("truncated")))
    return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(first);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const fields = parsed as Record<string, unknown>;
  if (!("output" in fields) || typeof fields.netRevision !== "string")
    return undefined;
  return message.toolName === readToolName || "netAfterChanges" in fields
    ? fields.netRevision
    : undefined;
};

/**
 * The model's net view by the request's messages alone: the `net_view`
 * section Pi's replay leaves shown, complete tool views, and hand-edit notes
 * after them. Written apart from `visibleNetView`.
 */
const oracle = (messages: readonly Message[]): OracleView => {
  let shownSection: Message | undefined;
  for (const message of messages)
    if (message.role === "system" && message.sections !== undefined) {
      const value = message.sections.net_view;
      if (value === null) shownSection = undefined;
      else if (value !== undefined) shownSection = message;
    }
  let view: string | undefined;
  let note: string | undefined;
  for (const message of messages) {
    let seen: string | undefined;
    if (message === shownSection) {
      const text = message.role === "system" ? message.sections?.net_view : "";
      seen = sectionBlock.exec(text ?? "")?.[1];
    } else seen = toolViewRevision(message);
    if (seen !== undefined) {
      view = seen;
      note = undefined;
      continue;
    }
    if (message.role === "user" && view !== undefined)
      note = noteBlock.exec(contentTexts(message).join(""))?.[1] ?? note;
  }
  if (view === undefined) return { state: "none" };
  if (note !== undefined && note !== view) return { state: "stale" };
  return { state: "current", revision: view };
};

// ─── The checks ──────────────────────────────────────────────────────────────

const answersOf = (entries: readonly EntryRecord[]) =>
  entries.filter(({ kind }) => kind === "pi.assistant");

/** I1: each request equals the committed effective context as of the newest entry before its answer. */
const expectI1 = async (root: Conversation, requests: readonly Message[][]) => {
  const entries = await allEntries(root);
  const answers = answersOf(entries);
  expect(requests).toHaveLength(answers.length);
  await Promise.all(
    answers.map(async (answer, index) => {
      const before = entries[entries.indexOf(answer) - 1];
      if (before === undefined) throw new Error("No entry before an answer.");
      expect(requests[index]).toEqual(
        (await root.context(context, { at: before.id })).messages,
      );
    }),
  );
};

/** The tool calls an assistant entry issued. */
const callIdsOf = (entry: EntryRecord) =>
  (entry.model ?? []).flatMap((message) =>
    message.role === "assistant"
      ? message.content.flatMap((part) =>
          part.type === "toolCall" ? [part.id] : [],
        )
      : [],
  );

/**
 * I2: every change that needs a fresh view was issued against the oracle's
 * revision for the request that issued it; one with no current view there
 * was refused and recorded nothing. Returns each change's decision.
 */
const expectI2 = async (
  harness: Harness,
  root: Conversation,
  requests: readonly Message[][],
) => {
  const entries = await allEntries(root);
  const answers = answersOf(entries);
  const records =
    (await harness.snapshot(BrowserCallsDoc, root.id, context))?.calls ?? {};
  const decisions: Record<string, string> = {};
  for (const [index, answer] of answers.entries())
    for (const message of answer.model ?? []) {
      if (message.role !== "assistant") continue;
      for (const part of message.content) {
        if (
          part.type !== "toolCall" ||
          !browserToolFacts(part.name).requiresFreshView
        )
          continue;
        const view = oracle(requests[index] ?? []);
        const record = records[part.id];
        if (view.state === "current") {
          expect(record?.issuedEntry).toBe(answer.id);
          expect(record?.expectedRevision).toBe(view.revision);
          decisions[part.id] = view.revision;
          continue;
        }
        expect(record).toBeUndefined();
        const result = entries
          .flatMap(({ model }) => model ?? [])
          .find(
            (candidate) =>
              candidate.role === "toolResult" &&
              candidate.toolCallId === part.id,
          );
        expect(result).toMatchObject({ isError: true });
        expect(textOf(result)).toBe(
          view.state === "stale" ? staleNetViewRefusal : noNetViewRefusal,
        );
        decisions[part.id] = view.state;
      }
    }
  // Every recorded change was judged above.
  expect(
    Object.values(records)
      .filter(({ toolName }) => browserToolFacts(toolName).requiresFreshView)
      .map(({ toolCallId }) => toolCallId)
      .toSorted(),
  ).toEqual(
    Object.keys(decisions)
      .filter((id) => records[id] !== undefined)
      .toSorted(),
  );
  return decisions;
};

const place = (id: string, name: string) => ({
  id,
  name,
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
});
const addPlace = (id: string) =>
  ["addPlace", id, place(`place-${id}`, `Place ${id}`)] as const;
const readNet = (id: string) => [readToolName, id, {}] as const;

/** A long answer, so a compaction keeps only the latest turn. */
const filler = (label: string) =>
  `${label} ${"The laundry runs on a schedule. ".repeat(120)}`;

test("I1 and I2 hold for every request: reads and changes, a pruning round, a hand-edit note, and a compaction with the section", async () => {
  const { model, ask, conversation, reportHandEdit, compact, server } =
    openServer();
  const created = await server.conversations.create(chatId);
  await created.harness.commit(
    (tx) => bindBrowserDocument(tx, created.root.id, binding),
    context,
  );
  const answers = new Map<string, BrowserAnswer>([
    ["read-1", read("R0")],
    ["c0", changed("R0", "R1")],
    ["c1", changed("R1", "R2")],
    // Its new revision reaches `details` and the record only.
    ["c2", detailsOnly("R2", "R3")],
    ["c3", changed("R2", "R4")],
    ["read-2", read("R5")],
    ["c5", changed("R5", "R6")],
    ["c6", changed("R6", "R7")],
  ]);
  const browser = scriptedBrowser(created.harness, created.root.id, answers);

  // A turn with reads and changes; the third round prunes c0, the fourth c1.
  model.script(
    calls(readNet("read-1")),
    calls(addPlace("c0")),
    calls(addPlace("c1"), addPlace("c2")),
    calls(addPlace("c3")),
    fauxAssistantMessage("Added them."),
  );
  await ask("Add a dryer, a washer and a press.");
  // The user edits by hand while idle: a note, placed at once.
  await reportHandEdit("R5", "episode-1");
  // c4 is refused against the stale view; the model reads, then changes.
  model.script(
    calls(addPlace("c4")),
    calls(readNet("read-2")),
    calls(addPlace("c5")),
    fauxAssistantMessage("Renamed."),
  );
  await ask("Rename the dryer.");
  model.script(fauxAssistantMessage(filler("Noted.")));
  await ask("It dries clothes.");
  await compact();
  // After compaction the section restores c5's read-back; c6 is issued against it.
  model.script(calls(addPlace("c6")), fauxAssistantMessage("Added."));
  await ask("Add an iron.");
  await browser.stop();

  const { harness, root } = await conversation();
  const { requests } = model;
  await expectI1(root, requests);
  expect(await expectI2(harness, root, requests)).toEqual({
    c0: "R0",
    c1: "R1",
    c2: "R1",
    // Not R3, which only c2's details name.
    c3: "R2",
    c4: "stale",
    c5: "R5",
    // From the `net_view` section alone.
    c6: "R6",
  });

  // The scenario covered what the invariants are claimed over.
  const entries = await allEntries(root);
  expect(entries.filter(({ kind }) => kind === pruneEntryKind)).toHaveLength(3);
  expect(
    requests.some((messages) =>
      messages.some((message) =>
        contentTexts(message).some((text) =>
          text.startsWith('<hand-edit revision="R5">'),
        ),
      ),
    ),
  ).toBe(true);
  expect(CompactionEntry.is((await root.context(context)).head)).toBe(true);
  const afterCompaction = requests.at(-2) ?? [];
  const [lead] = afterCompaction;
  expect(lead?.role).toBe("system");
  expect(
    lead?.role === "system" ? lead.sections?.net_view : undefined,
  ).toContain('<net-view revision="R6">');
  expect(
    afterCompaction.some(
      (message) => message.role === "toolResult" && message.toolCallId === "c5",
    ),
  ).toBe(false);
  expect(callIdsOf(answersOf(entries).at(-2)!)).toEqual(["c6"]);
});
