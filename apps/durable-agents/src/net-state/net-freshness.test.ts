/**
 * Net freshness through the real tool path: a Petrinaut document change is
 * refused without a current view of the net in the model's context, admitted
 * against the revision of the latest read, and admitted after a restart, from
 * committed entries and records alone.
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
} from "../browser-call/browser-call";
import { petrinautBrowserToolsExtension } from "../browser-call/petrinaut-browser-tools";
import { noNetViewRefusal } from "./net-freshness";

import type { Message } from "@earendil-works/pi-ai";
import type { Models } from "@earendil-works/pi-ai/models";
import type { FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";

const context = BACKGROUND_CONTEXT;

const place = {
  id: "place-dryer",
  name: "Dryer",
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
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

const openHarness = (storage: Storage, models: Models) => {
  const registry = createRegistry();
  registry.install(browserCallExtension);
  registry.install(petrinautBrowserToolsExtension);
  return Harness.open(storage, { models, registry }, context);
};

const openRoot = async (harness: Harness, model: ModelRef) => {
  const root = await harness.root(context, {
    agent: { model, extensions: [petrinautBrowserToolsExtension] },
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
  output: unknown,
  metadata?: unknown,
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

const readMetadata = { documentRevision: { before: "revision-1" } };

describe("net freshness", () => {
  test("refuses a change without a net read in the model's context, and issues nothing", async () => {
    const { models, model } = scriptedModel([
      call("addPlace", "add-1", place),
      fauxAssistantMessage("I could not add it."),
    ]);
    const harness = await openHarness(new MemoryStorage(), models);
    const root = await openRoot(harness, model);
    const submission = await root.submit(
      { type: "input", content: "Add a dryer." },
      context,
    );
    expect((await submission.wait(context)).status).toBe("done");
    expect(await toolResult(root, "add-1")).toMatchObject({
      isError: true,
      content: [{ type: "text", text: noNetViewRefusal }],
    });
    expect(
      (await harness.snapshot(BrowserCallsDoc, root.id, context))?.calls[
        "add-1"
      ],
    ).toBeUndefined();
    await harness.close(context);
  });

  test("a read, then a change: the change is issued against the read's revision", async () => {
    const { models, model } = scriptedModel([
      call("readNetOutline", "read-1"),
      call("addPlace", "add-1", place),
      fauxAssistantMessage("Added the dryer."),
    ]);
    const harness = await openHarness(new MemoryStorage(), models);
    const root = await openRoot(harness, model);
    const submission = await root.submit(
      { type: "input", content: "Add a dryer." },
      context,
    );
    await answer(harness, root.id, "read-1", { title: "Net" }, readMetadata);
    await answer(harness, root.id, "add-1", { applied: true });
    expect((await submission.wait(context)).status).toBe("done");
    const calls = (await harness.snapshot(BrowserCallsDoc, root.id, context))
      ?.calls;
    expect(calls?.["read-1"]?.expectedRevision).toBeUndefined();
    expect(calls?.["add-1"]).toMatchObject({
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
    const harness = await openHarness(new MemoryStorage(), models);
    const root = await openRoot(harness, model);
    const submission = await root.submit(
      { type: "input", content: "Add a dryer." },
      context,
    );
    await answer(harness, root.id, "read-1", { title: "Net" });
    expect((await submission.wait(context)).status).toBe("done");
    expect(await toolResult(root, "add-1")).toMatchObject({
      isError: true,
      content: [{ type: "text", text: noNetViewRefusal }],
    });
    await harness.close(context);
  });

  test("the view survives a restart: a change after reopening is admitted against the earlier read", async () => {
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
    const first = await openHarness(await openNodeSqliteStorage(file), models);
    const before = await openRoot(first, model);
    const read = await before.submit(
      { type: "input", content: "What is in the net?" },
      context,
    );
    await answer(first, before.id, "read-1", { title: "Net" }, readMetadata);
    expect((await read.wait(context)).status).toBe("done");
    await first.close(context);

    // A new process: nothing of the first Harness but its storage.
    const second = await openHarness(await openNodeSqliteStorage(file), models);
    const root = await second.root(context);
    const change = await root.submit(
      { type: "input", content: "Add a dryer." },
      context,
    );
    await answer(second, root.id, "add-1", { applied: true });
    expect((await change.wait(context)).status).toBe("done");
    expect(
      (await second.snapshot(BrowserCallsDoc, root.id, context))?.calls[
        "add-1"
      ],
    ).toMatchObject({ status: "settled", expectedRevision: "revision-1" });
    await second.close(context);
    await rm(directory, { recursive: true, force: true });
  });
});
