/**
 * Net freshness through the real tool path: a Petrinaut document change is
 * issued only against the net view in the context the model had when it
 * issued it, read through the host binding at the call's assistant entry. It
 * is refused with no view, refused when a later hand-edit note made the view
 * stale, admitted after a read or a change's complete read-back, and never
 * credits `details`. The view survives a restart: it is stored history.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type Conversation,
  type ConversationId,
  createRegistry,
  type EntryRecord,
  Harness,
  type JsonObject,
  MemoryStorage,
  type ModelRef,
  type Storage,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { describe, expect, test, vi } from "vitest";

import { hashNoNetViewRefusal } from "@hashintel/brunch-agent";

import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../../test/scripted-model";
import { createHostBinding, type HostBinding } from "../agent/host-binding";
import {
  bindBrowserDocument,
  browserCallExtension,
  type BrowserCallResult,
  BrowserCallsDoc,
  claimBrowserCall,
  finishBrowserCall,
} from "../browser-call/browser-call";
import { createPetrinautBrowserToolsExtension } from "../browser-call/petrinaut-browser-tools";
import {
  expectedNetRevision,
  noNetViewRefusal,
  staleNetViewRefusal,
} from "./net-freshness";
import { handEditEntryKind, renderHandEditNote } from "./visible-net-view";

import type { Message } from "@earendil-works/pi-ai";
import type { Models } from "@earendil-works/pi-ai/models";
import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";

const context = BACKGROUND_CONTEXT;

const place = {
  id: "place-dryer",
  name: "Dryer",
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
};

const call = (
  toolName: string,
  id: string,
  args: JsonObject = {},
): FauxResponseStep =>
  fauxAssistantMessage(fauxToolCall(toolName, args, { id }), {
    stopReason: "toolUse",
  });

/** A Harness with the Petrinaut browser tools over its own host binding; `bound: false` leaves it unbound. */
const openHarness = async (
  storage: Storage,
  models: Models,
  { bound = true }: { readonly bound?: boolean } = {},
) => {
  const host: HostBinding = createHostBinding();
  const tools = createPetrinautBrowserToolsExtension(host);
  const registry = createRegistry();
  registry.install(browserCallExtension);
  registry.install(tools);
  const harness = await Harness.open(storage, { models, registry }, context);
  if (bound) host.bind(harness);
  return { harness, tools };
};

const openRoot = async (
  { harness, tools }: Awaited<ReturnType<typeof openHarness>>,
  model: ModelRef,
) => {
  const root = await harness.root(context, {
    agent: { model, extensions: [tools] },
  });
  await harness.commit(
    (tx) =>
      bindBrowserDocument(tx, root.id, {
        conversationId: "conversation-1",
        documentId: "net-1",
      }),
    context,
  );
  return root;
};

/** The browser's side: claim the issued call and finish it with `output` and `metadata`. */
const answer = async (
  harness: Harness,
  conversationId: ConversationId,
  toolCallId: string,
  output: BrowserCallResult["output"],
  metadata?: BrowserCallResult["metadata"],
) => {
  await vi.waitFor(async () => {
    const calls = (
      await harness.snapshot(BrowserCallsDoc, conversationId, context)
    )?.calls;
    expect(calls?.[toolCallId]?.status).toBe("pending");
  });
  const claim = await claimBrowserCall(
    harness,
    conversationId,
    toolCallId,
    context,
  );
  if (claim === undefined) throw new Error(`${toolCallId} was not claimable.`);
  await finishBrowserCall(
    harness,
    {
      conversationId,
      toolCallId,
      toolName: claim.toolName,
      capability: claim.capability,
      canonicalInput: claim.input,
      output,
      metadata,
    },
    context,
  );
};

const toolResult = async (conversation: Conversation, toolCallId: string) => {
  const entries: readonly EntryRecord[] = (
    await conversation.entries({ order: "ascending" }, 200, undefined, context)
  ).items;
  return entries
    .flatMap(({ model }): readonly Message[] => model ?? [])
    .find(
      (message) =>
        message.role === "toolResult" && message.toolCallId === toolCallId,
    );
};

const recordOf = async (
  harness: Harness,
  conversationId: ConversationId,
  toolCallId: string,
) =>
  (await harness.snapshot(BrowserCallsDoc, conversationId, context))?.calls[
    toolCallId
  ];

const readMetadata = (revision: string) => ({
  documentRevision: { before: revision },
});

const changeMetadata = (before: string, after: string) => ({
  documentRevision: { before, after },
  readBack: { places: [{ id: place.id, name: place.name }], revision: after },
});

/** A hand-edit note, as the hand-edit route admits it (U3), written directly. */
const writeNote = async (
  root: Conversation,
  reportId: string,
  revision: string,
) => {
  const submission = await root.submit(
    {
      type: "write",
      requestId: `${handEditEntryKind}:${reportId}`,
      entry: {
        kind: handEditEntryKind,
        data: { episode: "episode-1", reportId, revision },
        model: [
          {
            role: "user",
            content: renderHandEditNote(revision),
            timestamp: 0,
          },
        ],
      },
    },
    context,
  );
  await submission.wait(context);
};

const go = async (
  root: Conversation,
  content: string,
  browser: () => Promise<void> = async () => undefined,
) => {
  const submission = await root.submit({ type: "input", content }, context);
  await browser();
  expect((await submission.wait(context)).status).toBe("done");
};

describe("net freshness at issue", () => {
  test("refuses a change without a net view in the model's context, and issues nothing", async () => {
    const { models, model } = scriptedModel([
      call("addPlace", "add-1", place),
      fauxAssistantMessage("I could not add it."),
    ]);
    const opened = await openHarness(new MemoryStorage(), models);
    const root = await openRoot(opened, model);
    await go(root, "Add a dryer.");
    expect(await toolResult(root, "add-1")).toMatchObject({
      isError: true,
      content: [{ type: "text", text: noNetViewRefusal }],
    });
    expect(await recordOf(opened.harness, root.id, "add-1")).toBeUndefined();
    await opened.harness.close(context);
  });

  test("a read, then a change: the change is issued against the read's revision", async () => {
    const { models, model } = scriptedModel([
      call("readNetOutline", "read-1"),
      call("addPlace", "add-1", place),
      fauxAssistantMessage("Added the dryer."),
    ]);
    const opened = await openHarness(new MemoryStorage(), models);
    const { harness } = opened;
    const root = await openRoot(opened, model);
    await go(root, "Add a dryer.", async () => {
      await answer(
        harness,
        root.id,
        "read-1",
        { title: "Net" },
        readMetadata("revision-1"),
      );
      await answer(harness, root.id, "add-1", { applied: true });
    });
    expect(
      (await recordOf(harness, root.id, "read-1"))?.expectedRevision,
    ).toBeUndefined();
    expect(await recordOf(harness, root.id, "add-1")).toMatchObject({
      status: "settled",
      expectedRevision: "revision-1",
    });
    await harness.close(context);
  });

  test("a change after a change's complete read-back is issued against the read-back's revision", async () => {
    const { models, model } = scriptedModel([
      call("readNetOutline", "read-1"),
      call("addPlace", "add-1", place),
      call("addPlace", "add-2", { ...place, id: "place-washer" }),
      fauxAssistantMessage("Added both."),
    ]);
    const opened = await openHarness(new MemoryStorage(), models);
    const { harness } = opened;
    const root = await openRoot(opened, model);
    await go(root, "Add a dryer and a washer.", async () => {
      await answer(
        harness,
        root.id,
        "read-1",
        { title: "Net" },
        readMetadata("revision-1"),
      );
      await answer(
        harness,
        root.id,
        "add-1",
        { applied: true },
        changeMetadata("revision-1", "revision-2"),
      );
      await answer(harness, root.id, "add-2", { applied: true });
    });
    expect(await recordOf(harness, root.id, "add-2")).toMatchObject({
      status: "settled",
      expectedRevision: "revision-2",
    });
    await harness.close(context);
  });

  test("never credits details: a change whose revision is only in its details leaves the earlier view", async () => {
    const { models, model } = scriptedModel([
      call("readNetOutline", "read-1"),
      call("addPlace", "add-1", place),
      call("addPlace", "add-2", { ...place, id: "place-washer" }),
      fauxAssistantMessage("Added both."),
    ]);
    const opened = await openHarness(new MemoryStorage(), models);
    const { harness } = opened;
    const root = await openRoot(opened, model);
    await go(root, "Add a dryer and a washer.", async () => {
      await answer(
        harness,
        root.id,
        "read-1",
        { title: "Net" },
        readMetadata("revision-1"),
      );
      // A revision after, but no read-back: the model is sent the bare output.
      await answer(
        harness,
        root.id,
        "add-1",
        { applied: true },
        { documentRevision: { before: "revision-1", after: "revision-2" } },
      );
      await answer(harness, root.id, "add-2", { applied: true });
    });
    const added = await toolResult(root, "add-1");
    expect(added).toMatchObject({
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ applied: true }) }],
      details: {
        metadata: { documentRevision: { after: "revision-2" } },
      },
    });
    expect(await recordOf(harness, root.id, "add-2")).toMatchObject({
      status: "settled",
      expectedRevision: "revision-1",
    });
    await harness.close(context);
  });

  test("a read whose browser reported no revision is no view", async () => {
    const { models, model } = scriptedModel([
      call("readNetOutline", "read-1"),
      call("addPlace", "add-1", place),
      fauxAssistantMessage("I could not add it."),
    ]);
    const opened = await openHarness(new MemoryStorage(), models);
    const root = await openRoot(opened, model);
    await go(root, "Add a dryer.", () =>
      answer(opened.harness, root.id, "read-1", { title: "Net" }),
    );
    expect(await toolResult(root, "add-1")).toMatchObject({
      isError: true,
      content: [{ type: "text", text: noNetViewRefusal }],
    });
    await opened.harness.close(context);
  });

  test("a hand-edit note after the read makes it stale: the change is refused in the panel's words, and issues nothing", async () => {
    const { models, model } = scriptedModel([
      call("readNetOutline", "read-1"),
      fauxAssistantMessage("Read it."),
      call("addPlace", "add-1", place),
      fauxAssistantMessage("I could not add it."),
    ]);
    const opened = await openHarness(new MemoryStorage(), models);
    const { harness } = opened;
    const root = await openRoot(opened, model);
    await go(root, "Read the net.", () =>
      answer(
        harness,
        root.id,
        "read-1",
        { title: "Net" },
        readMetadata("revision-1"),
      ),
    );
    await writeNote(root, "episode-1:1", "revision-2");
    await go(root, "Add a dryer.");
    expect(await toolResult(root, "add-1")).toMatchObject({
      isError: true,
      content: [{ type: "text", text: staleNetViewRefusal }],
    });
    expect(await recordOf(harness, root.id, "add-1")).toBeUndefined();
    await harness.close(context);
  });

  test("a note naming the read's own revision leaves the view current", async () => {
    const { models, model } = scriptedModel([
      call("readNetOutline", "read-1"),
      fauxAssistantMessage("Read it."),
      call("addPlace", "add-1", place),
      fauxAssistantMessage("Added the dryer."),
    ]);
    const opened = await openHarness(new MemoryStorage(), models);
    const { harness } = opened;
    const root = await openRoot(opened, model);
    await go(root, "Read the net.", () =>
      answer(
        harness,
        root.id,
        "read-1",
        { title: "Net" },
        readMetadata("revision-1"),
      ),
    );
    await writeNote(root, "episode-1:1", "revision-1");
    await go(root, "Add a dryer.", () =>
      answer(harness, root.id, "add-1", { applied: true }),
    );
    expect(await recordOf(harness, root.id, "add-1")).toMatchObject({
      expectedRevision: "revision-1",
    });
    await harness.close(context);
  });

  test("an unbound host fails the change as a tool error and records nothing", async () => {
    const { models, model } = scriptedModel([
      call("readNetOutline", "read-1"),
      call("addPlace", "add-1", place),
      fauxAssistantMessage("I could not add it."),
    ]);
    const opened = await openHarness(new MemoryStorage(), models, {
      bound: false,
    });
    const { harness } = opened;
    const root = await openRoot(opened, model);
    await go(root, "Add a dryer.", () =>
      answer(
        harness,
        root.id,
        "read-1",
        { title: "Net" },
        readMetadata("revision-1"),
      ),
    );
    const result = await toolResult(root, "add-1");
    expect(result?.role === "toolResult" && result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("Host is not bound.");
    expect(await recordOf(harness, root.id, "add-1")).toBeUndefined();
    await harness.close(context);
  });

  test("the view survives a restart: a change after reopening, over a fresh binding, is admitted against the earlier read", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "durable-agents-freshness-"),
    );
    const file = join(directory, "session.sqlite");
    const { models, model } = scriptedModel([
      call("readNetOutline", "read-1"),
      fauxAssistantMessage("The net is empty."),
      call("addPlace", "add-1", place),
      fauxAssistantMessage("Added the dryer."),
    ]);
    try {
      const first = await openHarness(
        await openNodeSqliteStorage(file),
        models,
      );
      const before = await openRoot(first, model);
      await go(before, "What is in the net?", () =>
        answer(
          first.harness,
          before.id,
          "read-1",
          { title: "Net" },
          readMetadata("revision-1"),
        ),
      );
      await first.harness.close(context);

      // A new process: nothing of the first Harness but its storage.
      const second = await openHarness(
        await openNodeSqliteStorage(file),
        models,
      );
      const root = await second.harness.root(context);
      await go(root, "Add a dryer.", () =>
        answer(second.harness, root.id, "add-1", { applied: true }),
      );
      expect(await recordOf(second.harness, root.id, "add-1")).toMatchObject({
        status: "settled",
        expectedRevision: "revision-1",
      });
      await second.harness.close(context);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("the no-view refusal", () => {
  test("the website's default keeps Brunch's words, naming its three reads", () => {
    expect(noNetViewRefusal).toBe(
      "Not started: no current view of the net is in your context, either because none was read or because it was compacted away. Read the net (readNetOutline, readNetStructure or getLatestNetDefinition), then make the change.",
    );
  });

  test("a caller's refusal replaces it when there is no view", () => {
    const none = { entries: [], contributions: [], messages: [] };
    expect(expectedNetRevision(none)).toEqual({ refusal: noNetViewRefusal });
    expect(expectedNetRevision(none, hashNoNetViewRefusal)).toEqual({
      refusal: hashNoNetViewRefusal,
    });
  });
});
