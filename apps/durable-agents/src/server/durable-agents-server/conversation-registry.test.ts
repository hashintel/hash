import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createRegistry, MemoryStorage } from "@earendil-works/pi-durable";
import { expect, test } from "vitest";

import { canonicalContent } from "@hashintel/brunch-agent";

import { scriptedModel } from "../../../test/scripted-model";
import {
  browserCallExtension,
  BrowserBindingDoc,
} from "../../browser-call/browser-call";
import { createConversationRegistry } from "./conversation-registry";
import { createRequestSlots } from "./request-slots";

import type { BrowserContext } from "@hashintel/brunch-agent";

const context = BACKGROUND_CONTEXT;
const chatId = "chat-1";
const binding: BrowserContext["binding"] = {
  conversationId: chatId,
  documentId: "net-1",
};

/**
 * A registry over one memory store that counts the batches it stores, with
 * what each `afterBind` read of the conversation's browser binding.
 */
const openRegistry = () => {
  const storage = Object.assign(new MemoryStorage(), {
    isOwner: async () => true,
  });
  let batches = 0;
  const commit = storage.commit.bind(storage);
  storage.commit = (written, receive, commitContext) => {
    batches += written.length;
    return commit(written, receive, commitContext);
  };
  const boundAtAfterBind: (string | null | undefined)[] = [];
  const { models, model } = scriptedModel([]);
  let created = false;
  const conversations = createConversationRegistry(
    {
      openStorage: async () => {
        created = true;
        return storage;
      },
      storageExists: async () => created,
      createRegistry: () => {
        const registry = createRegistry();
        registry.install(browserCallExtension);
        return registry;
      },
      models,
      agent: { model },
      afterBind: async ({ harness, root }) => {
        boundAtAfterBind.push(
          (await harness.snapshot(BrowserBindingDoc, root.id, context))
            ?.binding,
        );
      },
    },
    {
      maxTurns: 8,
      crashLoopRestarts: Infinity,
      requestSlots: createRequestSlots(1),
    },
    context,
  );
  return {
    conversations,
    batches: () => batches,
    boundAtAfterBind,
  };
};

test("a conversation created with a binding is bound in the commit that creates it, so afterBind sees it bound", async () => {
  const unbound = openRegistry();
  const bound = openRegistry();
  try {
    await unbound.conversations.create(chatId);
    const { harness, root } = await bound.conversations.create(chatId, {
      binding,
    });

    expect(bound.boundAtAfterBind).toEqual([canonicalContent(binding)]);
    expect(
      (await harness.snapshot(BrowserBindingDoc, root.id, context))?.binding,
    ).toBe(canonicalContent(binding));
    // Binding adds no commit of its own.
    expect(bound.batches()).toBe(unbound.batches());
    expect(unbound.boundAtAfterBind).toEqual([undefined]);
  } finally {
    await Promise.all([
      unbound.conversations.close(),
      bound.conversations.close(),
    ]);
  }
});

test("creating a conversation that already exists leaves its binding as it is", async () => {
  const { conversations, boundAtAfterBind } = openRegistry();
  try {
    await conversations.create(chatId);
    const { harness, root } = await conversations.create(chatId, { binding });
    expect(
      (await harness.snapshot(BrowserBindingDoc, root.id, context))?.binding,
    ).toBeUndefined();
    expect(boundAtAfterBind).toEqual([undefined]);
  } finally {
    await conversations.close();
  }
});
