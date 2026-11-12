/**
 * H0b (ii): a per-conversation Save installed into a Harness's live registry
 * once the binding is known (`hash-agent-port.md` §2, "Save's description
 * names the conversation's `documentId`").
 *
 * The registry starts with a placeholder Save under the extension name the
 * conversation selects. After `Harness.open` and the host binding's `bind`,
 * and after the document binding is committed, `registry.install` replaces
 * it with a Save whose description names the bound `documentId`. Pi stores
 * only extension names and resolves them from the registry per operation, so
 * the next request must carry the new description. Nothing about it is
 * stored: a reopened Harness starts from its own placeholder, so the host
 * must install the bound Save again on open, before scheduling starts.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getCurrentTools } from "@earendil-works/pi-ai/utils/transcript";
import { type ConversationId, type Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import * as v from "valibot";
import { afterEach, beforeEach, expect, test } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent";

import {
  bindBrowserDocument,
  BrowserBindingDoc,
} from "../../../src/browser-call/browser-call";
import { context, fauxAssistantMessage, recordingModel } from "../support";
import {
  boundSaveDescription,
  type OpenedHarness,
  openHarness,
  placeholderSaveDescription,
  saveExtension,
  toolDeltas,
} from "./support";

import type { Message } from "@earendil-works/pi-ai";

const binding = { conversationId: "conversation", documentId: "net-42" };

// A closed Harness closes its storage: each Harness opens the same file anew.
let directory: string;
let file: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "durable-hash-save-"));
  file = join(directory, "session.sqlite");
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

/** Save's description in a request's offered tools. */
const saveDescriptionIn = (messages: readonly Message[]) =>
  getCurrentTools(messages).find(({ name }) => name === brunchTools.appSaveNet)
    ?.description;

/** The bound document's ID, from the conversation's committed binding. */
const boundDocumentId = async (
  harness: Harness,
  conversationId: ConversationId,
) => {
  const stored = (
    await harness.snapshot(BrowserBindingDoc, conversationId, context)
  )?.binding;
  if (stored === null || stored === undefined) return undefined;
  return v.parse(v.object({ documentId: v.string() }), JSON.parse(stored))
    .documentId;
};

/** H8's install: Save for the bound document, when there is one. */
const installBoundSave =
  (conversationId: ConversationId) =>
  async ({ harness, registry }: OpenedHarness) => {
    const documentId = await boundDocumentId(harness, conversationId);
    if (documentId !== undefined)
      registry.install(saveExtension(boundSaveDescription(documentId)));
  };

const placeholder = saveExtension(placeholderSaveDescription);

/** A first Harness: the conversation is created, bound, then the bound Save installed, and one turn runs. */
const firstTurn = async () => {
  const { models, model, requests } = recordingModel([
    fauxAssistantMessage("Ready."),
  ]);
  const opened = await openHarness(
    await openNodeSqliteStorage(file),
    models,
    () => [placeholder],
  );
  const { harness, registry } = opened;
  try {
    const root = await harness.root(context, {
      agent: { model, extensions: [placeholder] },
    });
    await harness.commit(
      (tx) => bindBrowserDocument(tx, root.id, binding),
      context,
    );
    // After open, after bind, after the binding commit, before the submission.
    registry.install(saveExtension(boundSaveDescription(binding.documentId)));
    await root.submit({ type: "input", content: "Hello." }, context);
    await root.waitForIdle(context);
    return { conversationId: root.id, requests };
  } finally {
    await harness.close(context);
  }
};

/** A reopened Harness over the same storage, optionally installing the bound Save after bind; one more turn. */
const reopenedTurn = async (
  conversationId: ConversationId,
  reinstall: boolean,
) => {
  const { models, requests } = recordingModel([fauxAssistantMessage("Saved?")]);
  const { harness } = await openHarness(
    await openNodeSqliteStorage(file),
    models,
    () => [placeholder],
    reinstall ? installBoundSave(conversationId) : undefined,
  );
  try {
    // As the server's registry: scheduling starts only after the install.
    harness.resume();
    const conversation = await harness.conversation(conversationId, context);
    if (conversation === undefined) throw new Error("No conversation.");
    await conversation.submit({ type: "input", content: "Save it." }, context);
    await conversation.waitForIdle(context);
    return requests;
  } finally {
    await harness.close(context);
  }
};

test("Save installed after open and bind: the first request carries the bound description, and a reopen that installs it again carries it with no tool change", async () => {
  const first = await firstTurn();
  expect(first.requests).toHaveLength(1);
  const [opening] = first.requests;
  expect(saveDescriptionIn(opening ?? [])).toBe(
    boundSaveDescription(binding.documentId),
  );
  // The placeholder never reached the model: one declaration of the tools.
  expect(toolDeltas(opening ?? [])).toHaveLength(1);

  const reopened = await reopenedTurn(first.conversationId, true);
  expect(reopened).toHaveLength(1);
  const [next] = reopened;
  expect(saveDescriptionIn(next ?? [])).toBe(
    boundSaveDescription(binding.documentId),
  );
  // Still the first turn's one declaration: the stored tools equal the offered ones.
  expect(toolDeltas(next ?? [])).toEqual(toolDeltas(opening ?? []));
});

test("Red: a reopen without the install offers the placeholder, which Pi declares as a tool change", async () => {
  const first = await firstTurn();
  const reopened = await reopenedTurn(first.conversationId, false);
  const [next] = reopened;
  expect(saveDescriptionIn(next ?? [])).toBe(placeholderSaveDescription);
  // Nothing about the bound description is stored: the changed declaration is removed and added again.
  expect(toolDeltas(next ?? []).at(-1)).toEqual({
    added: [brunchTools.appSaveNet],
    removed: [brunchTools.appSaveNet],
  });
});

test("an install between two turns of one open Harness reaches the next request", async () => {
  const { models, model, requests } = recordingModel([
    fauxAssistantMessage("Ready."),
    fauxAssistantMessage("Saved?"),
  ]);
  const { harness, registry } = await openHarness(
    await openNodeSqliteStorage(file),
    models,
    () => [placeholder],
  );
  try {
    const root = await harness.root(context, {
      agent: { model, extensions: [placeholder] },
    });
    await root.submit({ type: "input", content: "Hello." }, context);
    await root.waitForIdle(context);
    registry.install(saveExtension(boundSaveDescription(binding.documentId)));
    await root.submit({ type: "input", content: "Save it." }, context);
    await root.waitForIdle(context);
    const [before, after] = requests;
    expect(saveDescriptionIn(before ?? [])).toBe(placeholderSaveDescription);
    expect(saveDescriptionIn(after ?? [])).toBe(
      boundSaveDescription(binding.documentId),
    );
  } finally {
    await harness.close(context);
  }
});
