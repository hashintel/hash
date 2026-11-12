import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type Conversation,
  createRegistry,
  defineExtension,
  defineTool,
  type EntryRecord,
  type Extension,
  Harness,
  LiveDoc,
  MemoryStorage,
  type Submission,
  type SubmissionId,
} from "@earendil-works/pi-durable";
import { obj } from "@earendil-works/pi-schema";
import { Hono } from "hono";
import { describe, expect, test, vi } from "vitest";

import {
  type BrowserCallClaim,
  browserToolFacts,
  brunchRoutes,
  canonicalContent,
  hashPetrinautTools,
  hashProcessEditorId,
} from "@hashintel/brunch-agent";

import { drain, openMemoryServer } from "../../test/platform/server";
import {
  allEntries,
  call,
  holdTool,
  kindsOf,
  recordingModel,
  shapeOf,
} from "../../test/platform/support";
import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../../test/scripted-model";
import { createHostBinding } from "../agent/host-binding";
import {
  handEditEntryKind,
  renderHandEditNote,
  renderNetRead,
  visibleNetView,
} from "../net-state/visible-net-view";
import {
  bindBrowserDocument,
  browserCallExtension,
  BrowserCallsDoc,
  claimBrowserCall,
  finishBrowserCall,
} from "./browser-call";
import { createBrowserCallRouter } from "./browser-call-router";
import { handEditsRoute } from "./hand-edit";
import { createHashBrowserToolsExtension } from "./hash-browser-tools";

import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";

const context = BACKGROUND_CONTEXT;
const routeConversationId = "conversation-1";
const toolCallId = "call-1";
const toolName = "petrinaut_create_place";
const getNet = { editor_id: hashProcessEditorId, detail: "outline" };
const modelInput = {
  editor_id: hashProcessEditorId,
  id: "place-dryer",
  name: "Dryer",
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
};
/** As the call is issued: the schema turns the model's name for the place into its ID. */
const input = hashPetrinautTools.petrinaut_create_place.zInput.parse(
  modelInput,
) as typeof modelInput;
const binding = canonicalContent({
  conversationId: routeConversationId,
  documentId: "net-1",
});
const answer = "Added the dryer.";

const readCallId = "read-1";

/**
 * A conversation bound to `binding` whose model reads the net, calls
 * `petrinaut_create_place`, then answers; the router mounted as the server would. Net
 * freshness admits the change against the read, which `answerRead` answers.
 * Unless `issued` is false, the read is answered and the change issued.
 */
const openConversation = async ({
  issueWaitMs = 50,
  issued = true,
}: { readonly issueWaitMs?: number; readonly issued?: boolean } = {}) => {
  const { models, model } = scriptedModel([
    fauxAssistantMessage(
      fauxToolCall("petrinaut_get_net", getNet, { id: readCallId }),
      {
        stopReason: "toolUse",
      },
    ),
    fauxAssistantMessage(
      fauxToolCall(toolName, modelInput, { id: toolCallId }),
      {
        stopReason: "toolUse",
      },
    ),
    fauxAssistantMessage(answer),
  ]);
  const host = createHostBinding();
  const browserTools = createHashBrowserToolsExtension(host);
  const registry = createRegistry();
  registry.install(browserCallExtension);
  registry.install(browserTools);
  const harness = await Harness.open(
    new MemoryStorage(),
    { models, registry },
    context,
  );
  host.bind(harness);
  const root = await harness.root(context, {
    agent: { model, extensions: [browserTools] },
  });
  await harness.commit(
    (tx) =>
      bindBrowserDocument(tx, root.id, {
        conversationId: routeConversationId,
        documentId: "net-1",
      }),
    context,
  );
  const app = new Hono().route(
    `${brunchRoutes.agents}/${brunchRoutes.petrinautAgent}`,
    createBrowserCallRouter({
      resolveHarness: (conversationId) =>
        conversationId === routeConversationId ? harness : undefined,
      issueWaitMs,
    }),
  );
  const submission = await root.submit(
    { type: "input", content: "Add a dryer." },
    context,
  );
  /** The browser answers the read, with the revision it observed. */
  const answerRead = async () => {
    await vi.waitFor(async () => {
      const calls = (await harness.snapshot(BrowserCallsDoc, root.id, context))
        ?.calls;
      expect(calls?.[readCallId]?.status).toBe("pending");
    });
    const claim = await claimBrowserCall(harness, root.id, readCallId, context);
    await finishBrowserCall(
      harness,
      {
        conversationId: root.id,
        toolCallId: readCallId,
        toolName: claim!.toolName,
        capability: claim!.capability,
        canonicalInput: claim!.input,
        output: { title: "Net" },
        metadata: readMetadata,
      },
      context,
    );
  };
  if (issued) {
    await answerRead();
    // The call is pending once its issue commit lands.
    await vi.waitFor(async () => {
      const calls = (await harness.snapshot(BrowserCallsDoc, root.id, context))
        ?.calls;
      expect(calls?.[toolCallId]).toBeDefined();
    });
  }
  return { harness, root, submission, app, answerRead };
};

const readMetadata = { documentRevision: { before: "revision-1" } };

/** The browser's side, over HTTP. */
const browserOf = (app: Hono, callId = toolCallId) => {
  const url = `${brunchRoutes.agents}/${brunchRoutes.petrinautAgent}/${routeConversationId}/${brunchRoutes.browserCalls}/${callId}`;
  const post = (suffix: string, body: unknown) =>
    app.request(`${url}${suffix}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  return {
    claim: (claimant: string, claimBinding = binding) =>
      post("", { claimant, binding: claimBinding }),
    start: (capability: string) => post("/start", { capability, binding }),
    lease: (capability: string) => post("/lease", { capability, binding }),
    result: (capability: string, output: unknown) =>
      post("/result", {
        capability,
        binding,
        toolName,
        canonicalInput: input,
        output,
        metadata: { verified: true },
      }),
    fail: (capability: string, disposition: "unstarted" | "stale" | "failed") =>
      post("/fail", {
        capability,
        binding,
        toolName,
        canonicalInput: input,
        disposition,
      }),
  };
};

const claimOf = async (response: Response) => {
  expect(response.status).toBe(200);
  return (await response.json()) as BrowserCallClaim;
};

const toolResultOf = async (conversation: Conversation) => {
  const entries: readonly EntryRecord[] = (
    await conversation.entries({ order: "ascending" }, 100, undefined, context)
  ).items;
  const result = entries
    .filter(({ kind }) => kind === "pi.tool-result")
    .map(({ model }) => model?.[0])
    .find(
      (message) =>
        message?.role === "toolResult" && message.toolCallId === toolCallId,
    );
  const reply = entries.findLast(({ kind }) => kind === "pi.assistant")
    ?.model?.[0];
  return { result, reply };
};

describe("browser-call router", () => {
  test("a canonical net mutation waits for the browser and completes over HTTP", async () => {
    expect(browserToolFacts(toolName).documentRevision).toBe("change");
    const { harness, root, submission, app } = await openConversation();
    const browser = browserOf(app);

    const claim = await claimOf(await browser.claim("tab-a"));
    expect(claim).toMatchObject({ toolName, input, binding });
    expect((await browser.start(claim.capability)).status).toBe(200);
    expect((await browser.lease(claim.capability)).status).toBe(200);
    const output = { applied: true, placeId: input.id };
    const posted = await browser.result(claim.capability, output);
    expect(posted.status).toBe(200);
    expect(await posted.json()).toEqual({ settled: true });

    const settled = await submission.wait(context);
    expect(settled.status).toBe("done");
    const { result, reply } = await toolResultOf(root);
    expect(result).toMatchObject({
      role: "toolResult",
      toolCallId,
      toolName,
      isError: false,
      content: [{ type: "text", text: JSON.stringify(output) }],
    });
    expect(reply).toMatchObject({ content: [{ type: "text", text: answer }] });
    await harness.close(context);
  });

  test("claims are idempotent per claimant, movable until start, and closed after it", async () => {
    const { harness, root, submission, app } = await openConversation();
    const browser = browserOf(app);

    // A lost response: the same tab claims again and gets the same capability.
    const first = await claimOf(await browser.claim("tab-a"));
    const resent = await claimOf(await browser.claim("tab-a"));
    expect(resent.capability).toBe(first.capability);

    // A reloaded tab re-claims before start; the old capability no longer holds.
    const reclaimed = await claimOf(await browser.claim("tab-b"));
    expect(reclaimed.capability).not.toBe(first.capability);
    expect((await browser.start(first.capability)).status).toBe(409);

    // The claim must prove the call's editor binding.
    const wrongBinding = await browser.claim(
      "tab-c",
      canonicalContent({
        conversationId: routeConversationId,
        documentId: "x",
      }),
    );
    expect(wrongBinding.status).toBe(403);

    expect((await browser.start(reclaimed.capability)).status).toBe(200);
    // Started: nobody claims it again, not even its holder.
    const late = await Promise.all(
      ["tab-a", "tab-b", "tab-c"].map(async (claimant) => {
        const response = await browser.claim(claimant);
        return {
          status: response.status,
          body: (await response.json()) as unknown,
        };
      }),
    );
    expect(late).toEqual(
      Array(3).fill({ status: 409, body: { error: "started" } }),
    );

    // A result with the wrong capability is refused, and the call keeps waiting.
    const forged = await browser.result(first.capability, { applied: true });
    expect(forged.status).toBe(409);
    const call = (await harness.snapshot(BrowserCallsDoc, root.id, context))
      ?.calls[toolCallId];
    expect(call?.status).toBe("claimed");

    expect(
      (await browser.result(reclaimed.capability, { applied: true })).status,
    ).toBe(200);
    expect((await submission.wait(context)).status).toBe("done");
    await harness.close(context);
  });

  test("an unstarted failure tells the model nothing ran", async () => {
    const { harness, root, submission, app } = await openConversation();
    const browser = browserOf(app);
    const claim = await claimOf(await browser.claim("tab-a"));
    const failed = await browser.fail(claim.capability, "unstarted");
    expect(failed.status).toBe(200);
    expect((await submission.wait(context)).status).toBe("done");
    const { result } = await toolResultOf(root);
    expect(result).toMatchObject({
      isError: true,
      content: [
        {
          type: "text",
          text: "Browser call was not started; no document operation was invoked.",
        },
      ],
    });
    await harness.close(context);
  });

  test("unknown conversations, calls and bodies are refused", async () => {
    const { harness, submission, app } = await openConversation();
    expect((await browserOf(app, "call-unknown").claim("tab-a")).status).toBe(
      404,
    );
    const invalid = await app.request(
      `${brunchRoutes.agents}/${brunchRoutes.petrinautAgent}/${routeConversationId}/${brunchRoutes.browserCalls}/${toolCallId}`,
      { method: "POST", body: JSON.stringify({ binding }) },
    );
    expect(invalid.status).toBe(400);
    const elsewhere = await app.request(
      `${brunchRoutes.agents}/${brunchRoutes.petrinautAgent}/other/${brunchRoutes.browserCalls}/${toolCallId}`,
      {
        method: "POST",
        body: JSON.stringify({ claimant: "tab-a", binding }),
      },
    );
    expect(elsewhere.status).toBe(404);
    await abandon(harness, submission);
  });
});

describe("browser-call router: early claims and committed records", () => {
  test("a claim sent before the call's issue commit waits for it and succeeds", async () => {
    const { harness, root, submission, app, answerRead } =
      await openConversation({ issueWaitMs: 3_000, issued: false });
    const browser = browserOf(app);
    // The stream would show the call now; its record does not exist yet.
    const early = browser.claim("tab-a");
    expect(
      (await harness.snapshot(BrowserCallsDoc, root.id, context))?.calls[
        toolCallId
      ],
    ).toBeUndefined();
    await answerRead();
    const claim = await claimOf(await early);
    expect(claim).toMatchObject({
      toolName,
      input,
      binding,
      expectedRevision: "revision-1",
    });
    expect((await browser.start(claim.capability)).status).toBe(200);
    expect(
      (await browser.result(claim.capability, { applied: true })).status,
    ).toBe(200);
    expect((await submission.wait(context)).status).toBe("done");
    await harness.close(context);
  });

  test("a claim for a call never issued waits only its bound", async () => {
    const { harness, submission, app } = await openConversation({
      issueWaitMs: 200,
    });
    const started = Date.now();
    expect((await browserOf(app, "call-unknown").claim("tab-a")).status).toBe(
      404,
    );
    const waited = Date.now() - started;
    expect(waited).toBeGreaterThanOrEqual(150);
    expect(waited).toBeLessThan(2_000);
    await abandon(harness, submission);
  });

  test("every call's committed output and metadata are readable by tool call ID, without capabilities", async () => {
    const { harness, submission, app } = await openConversation();
    const browser = browserOf(app);
    const claim = await claimOf(await browser.claim("tab-a"));
    expect((await browser.start(claim.capability)).status).toBe(200);
    await browser.result(claim.capability, { applied: true });
    expect((await submission.wait(context)).status).toBe("done");

    const response = await app.request(
      `${brunchRoutes.agents}/${brunchRoutes.petrinautAgent}/${routeConversationId}/${brunchRoutes.browserCalls}`,
    );
    expect(response.status).toBe(200);
    const { calls } = (await response.json()) as {
      calls: Record<string, Record<string, unknown>>;
    };
    expect(calls[readCallId]).toMatchObject({
      toolName: "petrinaut_get_net",
      status: "settled",
      output: { title: "Net" },
      metadata: readMetadata,
      callIndex: 0,
    });
    expect(calls[toolCallId]).toMatchObject({
      toolCallId,
      toolName,
      input,
      status: "settled",
      output: { applied: true },
      metadata: { verified: true },
      callIndex: 0,
    });
    expect(Object.keys(calls[toolCallId] ?? {}).toSorted()).toEqual(
      [
        "callIndex",
        "input",
        "issuedEntry",
        "metadata",
        "output",
        "status",
        "toolCallId",
        "toolName",
      ].toSorted(),
    );
    expect(
      (
        await app.request(
          `${brunchRoutes.agents}/${brunchRoutes.petrinautAgent}/other/${brunchRoutes.browserCalls}`,
        )
      ).status,
    ).toBe(404);
    await harness.close(context);
  });
});

const routePrefix = `${brunchRoutes.agents}/${brunchRoutes.petrinautAgent}`;
const handEditsUrl = (conversationId = routeConversationId) =>
  `${routePrefix}/${conversationId}/${brunchRoutes.browserCalls}/${handEditsRoute}`;

/** POST a hand-edit report to `app`; `body` is sent as is. */
const postHandEdit = (
  app: Hono,
  body: unknown,
  conversationId = routeConversationId,
) =>
  app.request(handEditsUrl(conversationId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const report = (episode: string, seq: number, revision: string) => ({
  binding,
  episode,
  seq,
  revision,
});

type Admitted = {
  readonly reportId: string;
  readonly submission: SubmissionId;
  readonly placement: string;
};

const admittedOf = async (response: Response) => {
  expect(response.status).toBe(200);
  return (await response.json()) as Admitted;
};

/** The `brunch.hand-edit` entries of `conversation`, oldest first. */
const notesOf = async (conversation: Conversation) =>
  (await allEntries(conversation)).filter(
    ({ kind }) => kind === handEditEntryKind,
  );

/**
 * A conversation answering `responses` through a recording faux model, with
 * `extensions` installed, bound to `binding` unless `bound` is false, and the
 * router mounted as the server mounts it.
 */
const openNoteConversation = async ({
  responses,
  extensions = [],
  bound = true,
}: {
  readonly responses: readonly FauxResponseStep[];
  readonly extensions?: readonly Extension[];
  readonly bound?: boolean;
}) => {
  const { models, model, requests } = recordingModel(responses);
  const registry = createRegistry();
  for (const extension of extensions) registry.install(extension);
  const harness = await Harness.open(
    new MemoryStorage(),
    { models, registry },
    context,
  );
  const root = await harness.root(context, { agent: { model } });
  if (bound)
    await harness.commit(
      (tx) =>
        bindBrowserDocument(tx, root.id, {
          conversationId: routeConversationId,
          documentId: "net-1",
        }),
      context,
    );
  const app = new Hono().route(
    routePrefix,
    createBrowserCallRouter({
      resolveHarness: (conversationId) =>
        conversationId === routeConversationId ? harness : undefined,
    }),
  );
  return { harness, root, app, requests };
};

/** Answer one input and settle. */
const converse = async (conversation: Conversation, text: string) =>
  (
    await (
      await conversation.submit({ type: "input", content: text }, context)
    ).wait(context)
  ).status;

describe("browser-call router: hand-edit reports", () => {
  test("an idle report admits exactly one note, placed at once, and starts no run (P7)", async () => {
    const { harness, root, app, requests } = await openNoteConversation({
      responses: [fauxAssistantMessage("first answer")],
    });
    try {
      expect(await converse(root, "hello")).toBe("done");
      const admitted = await admittedOf(
        await postHandEdit(app, report("episode-1", 0, "revision-2")),
      );
      expect(admitted).toMatchObject({
        reportId: "episode-1:0",
        placement: "done",
      });

      await root.waitForIdle(context);
      expect(
        (await harness.snapshot(LiveDoc, root.id, context))?.run,
      ).toBeUndefined();
      expect(requests).toHaveLength(1);
      const entries = await allEntries(root);
      expect(kindsOf(entries)).toEqual([
        "pi.user",
        "pi.assistant",
        handEditEntryKind,
      ]);
      expect(entries.at(-1)).toMatchObject({
        data: {
          episode: "episode-1",
          reportId: "episode-1:0",
          revision: "revision-2",
        },
        model: [{ role: "user", content: renderHandEditNote("revision-2") }],
      });
      expect(
        await (
          await harness.submission(admitted.submission, context)
        )?.status(context),
      ).toMatchObject({
        type: "write",
        requestId: "brunch.hand-edit:episode-1:0",
      });
    } finally {
      await harness.close(context);
    }
  });

  test("a retried report admits nothing more and returns the first submission", async () => {
    const { harness, root, app } = await openNoteConversation({
      responses: [],
    });
    try {
      const first = await admittedOf(
        await postHandEdit(app, report("episode-1", 0, "revision-2")),
      );
      const retried = await Promise.all(
        [0, 1].map(async () =>
          admittedOf(
            await postHandEdit(app, report("episode-1", 0, "revision-2")),
          ),
        ),
      );
      expect(retried).toEqual([first, first]);
      expect(await notesOf(root)).toHaveLength(1);
    } finally {
      await harness.close(context);
    }
  });

  test("a report under a new episode or seq admits a new note, even for a revision already reported", async () => {
    const { harness, root, app } = await openNoteConversation({
      responses: [],
    });
    try {
      const reports = [
        report("episode-1", 0, "revision-2"),
        report("episode-1", 1, "revision-3"),
        // The user edits back to revision-2 after a later view: a new episode.
        report("episode-2", 0, "revision-2"),
      ];
      const admitted: Admitted[] = [];
      for (const body of reports)
        // eslint-disable-next-line no-await-in-loop -- Reports arrive in order.
        admitted.push(await admittedOf(await postHandEdit(app, body)));
      expect(new Set(admitted.map(({ submission }) => submission)).size).toBe(
        3,
      );
      expect((await notesOf(root)).map(({ data }) => data as unknown)).toEqual([
        {
          episode: "episode-1",
          reportId: "episode-1:0",
          revision: "revision-2",
        },
        {
          episode: "episode-1",
          reportId: "episode-1:1",
          revision: "revision-3",
        },
        {
          episode: "episode-2",
          reportId: "episode-2:0",
          revision: "revision-2",
        },
      ]);
    } finally {
      await harness.close(context);
    }
  });

  test("a report during a tool round is queued, lands after the round's results, and starts no second run (P7)", async () => {
    const hold = holdTool();
    const { harness, root, app, requests } = await openNoteConversation({
      responses: [call("hold", "h1"), fauxAssistantMessage("answer")],
      extensions: [defineExtension({ name: "hold", tools: [hold.tool] })],
    });
    try {
      const input = await root.submit(
        { type: "input", content: "go" },
        context,
      );
      await hold.started;
      const admitted = await admittedOf(
        await postHandEdit(app, report("episode-1", 0, "revision-2")),
      );
      expect(admitted.placement).toBe("queued");
      expect(await notesOf(root)).toHaveLength(0);
      hold.release();
      expect((await input.wait(context)).status).toBe("done");
      await root.waitForIdle(context);
      expect(kindsOf(await allEntries(root))).toEqual([
        "pi.user",
        "pi.system",
        "pi.assistant(h1)",
        "pi.tool-result(h1)",
        handEditEntryKind,
        "pi.assistant",
      ]);
      expect(requests).toHaveLength(2);
      expect(shapeOf(requests[1]!).at(-1)).toBe(
        `user:${renderHandEditNote("revision-2")}`,
      );
    } finally {
      await harness.close(context);
    }
  });

  test("unknown conversations get 404, malformed bodies 400, and a wrong or missing binding 409, writing nothing", async () => {
    const { harness, root, app } = await openNoteConversation({
      responses: [],
    });
    const unbound = await openNoteConversation({
      responses: [],
      bound: false,
    });
    try {
      const valid = report("episode-1", 0, "revision-2");
      // As the claim route: the body parses first, then the conversation resolves.
      expect((await postHandEdit(app, valid, "other")).status).toBe(404);
      expect(
        (
          await app.request(
            `${routePrefix}/other/${brunchRoutes.browserCalls}/${toolCallId}`,
            {
              method: "POST",
              body: JSON.stringify({ claimant: "tab-a", binding }),
            },
          )
        ).status,
      ).toBe(404);
      const malformed: unknown[] = [
        "not json",
        {},
        { ...valid, binding: undefined },
        { ...valid, episode: "" },
        { ...valid, seq: -1 },
        { ...valid, seq: 1.5 },
        { ...valid, seq: "0" },
        { ...valid, revision: "" },
        { ...valid, revision: 2 },
      ];
      const statuses = await Promise.all(
        malformed.map(async (body) => (await postHandEdit(app, body)).status),
      );
      expect(statuses).toEqual(malformed.map(() => 400));
      expect(
        await (await postHandEdit(app, "not json", "other")).json(),
      ).toEqual({ error: "invalid-body" });

      const wrong = await postHandEdit(app, {
        ...valid,
        binding: canonicalContent({
          conversationId: routeConversationId,
          documentId: "x",
        }),
      });
      expect(wrong.status).toBe(409);
      expect(await wrong.json()).toEqual({ error: "wrong-binding" });
      expect((await postHandEdit(unbound.app, valid)).status).toBe(409);

      expect(await notesOf(root)).toHaveLength(0);
      expect(await notesOf(unbound.root)).toHaveLength(0);
      expect(
        (await harness.snapshot(BrowserCallsDoc, root.id, context))?.calls ??
          {},
      ).toEqual({});
    } finally {
      await Promise.all([
        harness.close(context),
        unbound.harness.close(context),
      ]);
    }
  });
});

/** A server-side stand-in for a browser net read rendered with its revision, as U4's rendering produces it. */
const standInRead = (revision: string) =>
  defineExtension({
    name: "stand-in-read",
    tools: [
      defineTool({
        name: "petrinaut_get_net",
        description: "Reads the net.",
        parameters: obj({}),
        execute: async () => ({
          output: [
            { type: "text", text: renderNetRead({ title: "Net" }, revision) },
          ],
        }),
      }),
    ],
  });

describe("browser-call router: hand-edit reports through the server", () => {
  test("the model's next request carries the note, the view is stale after it, and the note is never streamed", async () => {
    const { models, model, requests } = recordingModel([
      call("petrinaut_get_net", "read-1"),
      fauxAssistantMessage("Read it."),
      fauxAssistantMessage("I will read the net again first."),
    ]);
    const { server, send, conversation } = openMemoryServer({
      models,
      model,
      extensions: [standInRead("revision-1")],
    });
    server.app.route(
      "/conversations",
      createBrowserCallRouter({
        // As `startDurableAgentsServer`: ownership is the registry's acquire.
        resolveHarness: async (conversationId) =>
          (await server.conversations.acquire(conversationId))?.harness,
      }),
    );
    const chatId = "chat-hand-edit";
    try {
      await drain(await send(chatId, "m1", "Read the net."));
      const { harness, root } = await conversation(chatId);
      await root.waitForIdle(context);
      expect(visibleNetView(await root.context(context))).toMatchObject({
        state: "current",
        revision: "revision-1",
      });
      await harness.commit(
        (tx) =>
          bindBrowserDocument(tx, root.id, {
            conversationId: chatId,
            documentId: "net-1",
          }),
        context,
      );
      const chatBinding = canonicalContent({
        conversationId: chatId,
        documentId: "net-1",
      });

      const response = await server.app.request(
        `/conversations/${chatId}/${brunchRoutes.browserCalls}/${handEditsRoute}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...report("episode-1", 0, "revision-2"),
            binding: chatBinding,
          }),
        },
      );
      expect(response.headers.get("content-type")).toMatch(
        /^application\/json/u,
      );
      expect(await admittedOf(response)).toMatchObject({ placement: "done" });
      expect(
        (
          await server.app.request(
            `/conversations/unknown/${brunchRoutes.browserCalls}/${handEditsRoute}`,
            {
              method: "POST",
              body: JSON.stringify(report("episode-1", 0, "revision-2")),
            },
          )
        ).status,
      ).toBe(404);

      expect(visibleNetView(await root.context(context))).toMatchObject({
        state: "stale",
        seen: "revision-1",
        edited: "revision-2",
      });
      expect(requests).toHaveLength(2);

      const chunks = await drain(await send(chatId, "m2", "Rename it."));
      expect(requests).toHaveLength(3);
      expect(shapeOf(requests[2]!).slice(-2)).toEqual([
        `user:${renderHandEditNote("revision-2")}`,
        "user:Rename it.",
      ]);
      expect(JSON.stringify(chunks)).not.toContain("hand-edit");
      expect(JSON.stringify(chunks)).toContain(
        "I will read the net again first.",
      );
    } finally {
      await server.close();
    }
  });
});

/** End a test whose call is never answered: abort the run and close. */
const abandon = async (harness: Harness, submission: Submission) => {
  const conversation = await harness.root(context);
  await conversation.abort(context);
  await submission.wait(context);
  await harness.close(context);
};
