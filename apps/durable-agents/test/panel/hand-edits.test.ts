/**
 * The Brunch panel's hand-edit reporter (`@hashintel/brunch-agent/client`)
 * against the durable agents server, in-process over SQLite: a hand edit
 * reaches the model as a stored note, once, never while a Brunch call runs,
 * and a refused report stops the reporting.
 *
 * The server is built with `createDurableAgentsServer`, with the browser-call
 * routes mounted beside it and a new conversation bound to its chat's
 * binding, as `startDurableAgentsServer` does; HASH's entry is left out, so
 * the conversation and web headers arrive unchecked.
 */
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { createRegistry } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { afterEach, expect, test, vi } from "vitest";

import { brunchRoutes, canonicalContent } from "@hashintel/brunch-agent";
import {
  BrunchPanelConversationTracker,
  createBrunchSuccessorPanelTransport,
  createHandEditReporter,
  type HandEditRefusal,
  successorEndpoints,
  type SuccessorConversation,
} from "@hashintel/brunch-agent/client";

import {
  browserCallExtension,
  browserToolName,
  claimBrowserCall,
  finishBrowserCall,
} from "../../src/browser-call/browser-call";
import { createBrowserCallRouter } from "../../src/browser-call/browser-call-router";
import { createDurableAgentsServer } from "../../src/server/durable-agents-server";
import { browserCallsPrefix } from "../../src/server/start-durable-agents-server";
import { calls, context } from "../platform/support";
import { fauxAssistantMessage, scriptedModel } from "../scripted-model";

import type { OwnedStorage } from "../../src/server/conversation-storage";
import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";
import type { BrowserContext } from "@hashintel/brunch-agent";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";

type PanelMessage =
  ReturnType<typeof createBrunchSuccessorPanelTransport> extends ChatTransport<
    infer Message
  >
    ? Message
    : never;

const origin = "http://durable.test";
const conversationId = "net-1:construction";
const documentId = "net-1";
const idleMs = 10;

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

/** Each conversation in its own SQLite file, owned by this one process. */
const sqliteConversations = async () => {
  const directory = await mkdtemp(join(tmpdir(), "panel-hand-edits-"));
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

/** The bound document as a list of revisions the user moves through by hand. */
const handEditedDocument = () => {
  let revision = "revision-1";
  const listeners = new Set<() => void>();
  return {
    document: {
      revision: () => revision,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    edit: (next: string) => {
      revision = next;
      for (const listener of listeners) listener();
    },
  };
};

/**
 * The server, whose model answers `responses` and may call `setNetTitle` in
 * the browser; and the panel's connection to it, recording every request.
 */
const openPanel = async (responses: FauxResponseStep[]) => {
  const { models, model } = scriptedModel(responses);
  const server = createDurableAgentsServer({
    now: Date.now,
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
    admitNewConversation: (body) =>
      body.binding === undefined
        ? { status: 404, error: "Unknown conversation." }
        : { binding: body.binding as BrowserContext["binding"] },
    context,
  });
  servers.push(server);
  server.app.route(
    browserCallsPrefix,
    createBrowserCallRouter({
      resolveHarness: async (id) =>
        (await server.conversations.acquire(id))?.harness,
      now: server.now,
    }),
  );
  const requests: {
    url: string;
    body: unknown;
    status?: number;
  }[] = [];
  /** Loses the next answer to a hand-edit report after the server has handled it. */
  let loseNextReportAnswer = false;
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    const sent: (typeof requests)[number] = {
      url,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    requests.push(sent);
    const response = await server.app.request(url, init);
    sent.status = response.status;
    if (url.endsWith(`/${brunchRoutes.handEdits}`) && loseNextReportAnswer) {
      loseNextReportAnswer = false;
      throw new TypeError("Failed to fetch");
    }
    return response;
  };
  const conversation: SuccessorConversation = {
    endpoint: origin,
    actorKey: "test-actor",
    conversationId,
    web: "web-1",
    fetch,
  };
  const endpoints = await successorEndpoints(conversation);
  const transport = createBrunchSuccessorPanelTransport(
    conversation,
    new BrunchPanelConversationTracker(),
    { documentId },
  );
  let sentMessages = 0;
  /** Send the user's next message and read its turn to the end. */
  const chat = async (text: string) => {
    sentMessages += 1;
    const message = {
      id: `message-${sentMessages}`,
      role: "user",
      parts: [{ type: "text", text }],
    } as PanelMessage;
    return drain(
      await transport.sendMessages({
        trigger: "submit-message",
        chatId: conversationId,
        messageId: undefined,
        messages: [message],
        abortSignal: undefined,
      }),
    );
  };
  const reports = () =>
    requests.filter(({ url }) => url === endpoints.handEdits);
  const history = async () =>
    (await (await fetch(endpoints.messages)).json()) as UIMessage[];
  return {
    server,
    conversation,
    endpoints,
    chat,
    reports,
    history,
    loseNextReportAnswer: () => {
      loseNextReportAnswer = true;
    },
  };
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

/** The model's answer, keeping the transcript it was sent. */
const answerSeeing =
  (transcripts: string[], text: string): FauxResponseStep =>
  (transcript) => {
    transcripts.push(JSON.stringify(transcript.messages));
    return fauxAssistantMessage(text);
  };

/** History's hand-edit notes: their IDs and the revisions they name. */
const notesOf = (messages: readonly UIMessage[]) =>
  messages.flatMap(({ id, parts }) =>
    parts.flatMap((part) =>
      part.type === "data-brunch-hand-edit"
        ? [{ id, revision: (part.data as { revision: string }).revision }]
        : [],
    ),
  );

test("an edit between turns reaches the next turn as a note in history", async () => {
  const transcripts: string[] = [];
  const panel = await openPanel([
    fauxAssistantMessage("A queue it is."),
    answerSeeing(transcripts, "I see your change."),
  ]);
  await panel.chat("Model a queue.");
  const net = handEditedDocument();
  const reporter = createHandEditReporter({
    conversation: panel.conversation,
    documentId,
    document: net.document,
    idleMs,
  });
  const stop = reporter.start();

  net.edit("revision-2");
  await vi.waitFor(() =>
    expect(panel.reports().map(({ status }) => status)).toEqual([200]),
  );
  await panel.chat("What changed?");
  stop();

  expect(transcripts[0]).toContain('<hand-edit revision=\\"revision-2\\">');
  const messages = await panel.history();
  const [report] = panel.reports();
  const episode = (report?.body as { episode?: string } | undefined)?.episode;
  expect(notesOf(messages)).toEqual([
    { id: `brunch.hand-edit:${episode}:0`, revision: "revision-2" },
  ]);
  expect(messages.map(({ role }) => role)).toEqual([
    "user",
    "assistant",
    "user",
    "user",
    "assistant",
  ]);
});

test("a report sent again after its answer was lost leaves one note", async () => {
  const panel = await openPanel([fauxAssistantMessage("A queue it is.")]);
  await panel.chat("Model a queue.");
  const net = handEditedDocument();
  const reporter = createHandEditReporter({
    conversation: panel.conversation,
    documentId,
    document: net.document,
    idleMs,
  });
  const stop = reporter.start();
  const reported = reporter.reportAround({
    claim: async (_call: { toolName: string; signal: AbortSignal }) =>
      undefined,
    run: async () => {},
  });

  panel.loseNextReportAnswer();
  net.edit("revision-2");
  await vi.waitFor(() => expect(panel.reports()).toHaveLength(1));
  await reported.claim({
    toolName: browserToolName,
    signal: new AbortController().signal,
  });
  stop();

  const [lost, resent] = panel.reports();
  expect(resent?.body).toEqual(lost?.body);
  expect(resent?.status).toBe(200);
  expect(notesOf(await panel.history())).toHaveLength(1);
});

test("no report is sent while a Brunch call runs; the edit made during it is reported as it ends", async () => {
  const panel = await openPanel([
    calls([browserToolName, "browser-1", { title: "Queue" }]),
    fauxAssistantMessage("Titled."),
  ]);
  const net = handEditedDocument();
  const reporter = createHandEditReporter({
    conversation: panel.conversation,
    documentId,
    document: net.document,
    idleMs,
  });
  const stop = reporter.start();
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reportsWhileRunning: number | undefined;
  // The panel's browser calls, answering through the server's own claim
  // once the user has approved the call.
  const reported = reporter.reportAround({
    run: async (_call, execute) => {
      await released;
      const output = await execute({});
      for (;;) {
        // eslint-disable-next-line no-await-in-loop -- Each try follows the last.
        const open = await panel.server.conversations.acquire(
          panel.endpoints.instanceId,
        );
        const claim =
          open &&
          // eslint-disable-next-line no-await-in-loop -- Each try follows the last.
          (await claimBrowserCall(
            open.harness,
            open.root.id,
            "browser-1",
            context,
            Date.now,
          ));
        if (open && claim) {
          reportsWhileRunning = panel.reports().length;
          // eslint-disable-next-line no-await-in-loop -- The loop ends here.
          await finishBrowserCall(
            open.harness,
            {
              conversationId: open.root.id,
              toolCallId: "browser-1",
              toolName: claim.toolName,
              capability: claim.capability,
              canonicalInput: claim.input,
              output: output as Parameters<
                typeof finishBrowserCall
              >[1]["output"],
            },
            context,
            Date.now,
          );
          return;
        }
        // eslint-disable-next-line no-await-in-loop -- Each try follows the last.
        await sleep(5);
      }
    },
  });

  const turn = panel.chat("Name the net Queue.");
  const ran = reported.run(
    { toolName: browserToolName, signal: new AbortController().signal },
    async () => ({ ok: true, title: "Queue" }),
  );
  await sleep(idleMs);
  net.edit("revision-2");
  await sleep(idleMs * 5);
  release();
  await ran;
  await turn;
  await vi.waitFor(() =>
    expect(panel.reports().map(({ status }) => status)).toEqual([200]),
  );
  stop();

  expect(reportsWhileRunning).toBe(0);
  expect(panel.reports()[0]?.body).toMatchObject({ revision: "revision-2" });
  await vi.waitFor(async () =>
    expect(notesOf(await panel.history())).toEqual([
      expect.objectContaining({ revision: "revision-2" }),
    ]),
  );
});

test("a report against another document's binding is refused, and the panel stops reporting", async () => {
  const panel = await openPanel([fauxAssistantMessage("A queue it is.")]);
  await panel.chat("Model a queue.");
  const net = handEditedDocument();
  const refusals: HandEditRefusal[] = [];
  const reporter = createHandEditReporter({
    conversation: panel.conversation,
    documentId: "net-2",
    document: net.document,
    idleMs,
    onRefused: (refusal) => refusals.push(refusal),
  });
  const stop = reporter.start();

  net.edit("revision-2");
  await vi.waitFor(() => expect(refusals).toHaveLength(1));
  net.edit("revision-3");
  await sleep(idleMs * 5);
  stop();

  expect(refusals[0]?.status).toBe(409);
  expect(
    panel.reports().map(({ status, body }) => ({
      status,
      binding: (body as { binding?: string } | undefined)?.binding,
    })),
  ).toEqual([
    {
      status: 409,
      binding: canonicalContent({ conversationId, documentId: "net-2" }),
    },
  ]);
  expect(notesOf(await panel.history())).toEqual([]);
});

test("a report before the conversation exists is dropped, and the first chat opens it without a note", async () => {
  const panel = await openPanel([fauxAssistantMessage("A queue it is.")]);
  const net = handEditedDocument();
  const reporter = createHandEditReporter({
    conversation: panel.conversation,
    documentId,
    document: net.document,
    idleMs,
  });
  const stop = reporter.start();

  net.edit("revision-2");
  await vi.waitFor(() =>
    expect(panel.reports().map(({ status }) => status)).toEqual([404]),
  );
  await panel.chat("Model a queue.");
  await sleep(idleMs * 5);
  stop();

  expect(panel.reports()).toHaveLength(1);
  expect(notesOf(await panel.history())).toEqual([]);
});
