import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type Conversation,
  createRegistry,
  type EntryRecord,
  Harness,
  MemoryStorage,
  type Submission,
} from "@earendil-works/pi-durable";
import { Hono } from "hono";
import { describe, expect, test, vi } from "vitest";

import {
  type BrowserCallClaim,
  browserToolFacts,
  brunchRoutes,
  canonicalContent,
} from "@hashintel/brunch-agent";

import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../../test/scripted-model";
import {
  bindBrowserDocument,
  browserCallExtension,
  BrowserCallsDoc,
  claimBrowserCall,
  finishBrowserCall,
} from "./browser-call";
import { createBrowserCallRouter } from "./browser-call-router";
import { petrinautBrowserToolsExtension } from "./petrinaut-browser-tools";

const context = BACKGROUND_CONTEXT;
const routeConversationId = "conversation-1";
const toolCallId = "call-1";
const toolName = "addPlace";
const input = {
  id: "place-dryer",
  name: "Dryer",
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
};
const binding = canonicalContent({
  conversationId: routeConversationId,
  documentId: "net-1",
});
const answer = "Added the dryer.";

const readCallId = "read-1";

/**
 * A conversation bound to `binding` whose model reads the net, calls
 * `addPlace`, then answers; the router mounted as the server would. Net
 * freshness admits the change against the read, which `answerRead` answers.
 * Unless `issued` is false, the read is answered and the change issued.
 */
const openConversation = async ({
  issueWaitMs = 50,
  issued = true,
}: { readonly issueWaitMs?: number; readonly issued?: boolean } = {}) => {
  const { models, model } = scriptedModel([
    fauxAssistantMessage(
      fauxToolCall("readNetOutline", {}, { id: readCallId }),
      {
        stopReason: "toolUse",
      },
    ),
    fauxAssistantMessage(fauxToolCall(toolName, input, { id: toolCallId }), {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage(answer),
  ]);
  const registry = createRegistry();
  registry.install(browserCallExtension);
  registry.install(petrinautBrowserToolsExtension);
  const harness = await Harness.open(
    new MemoryStorage(),
    { models, registry },
    context,
  );
  const root = await harness.root(context, {
    agent: { model, extensions: [petrinautBrowserToolsExtension] },
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
      toolName: "readNetOutline",
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

/** End a test whose call is never answered: abort the run and close. */
const abandon = async (harness: Harness, submission: Submission) => {
  const conversation = await harness.root(context);
  await conversation.abort(context);
  await submission.wait(context);
  await harness.close(context);
};
