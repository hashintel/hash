import { setTimeout as sleep } from "node:timers/promises";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  AgentDoc,
  createRegistry,
  defineExtension,
  Harness,
  MemoryStorage,
} from "@earendil-works/pi-durable";
import { expect, test } from "vitest";

import { canonicalContent } from "@hashintel/brunch-agent";

import { scriptedModel } from "../../../test/scripted-model";
import {
  browserCallExtension,
  BrowserBindingDoc,
} from "../../browser-call/browser-call";
import { createConversationRegistry } from "./conversation-registry";
import { createRequestSlots, requestSlotsExtensionName } from "./request-slots";

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

test("closing the registry waits for a Harness it evicted for lost ownership to close", async () => {
  const releaseClose = Promise.withResolvers<void>();
  /** Each open's storage; the first loses ownership, and its close waits for `releaseClose`. */
  const storages: { owner: boolean }[] = [];
  const { models, model } = scriptedModel([]);
  const conversations = createConversationRegistry(
    {
      openStorage: async () => {
        const storage = Object.assign(new MemoryStorage(), { owner: true });
        if (storages.length === 0) {
          const close = storage.close.bind(storage);
          storage.close = async (closeContext) => {
            await releaseClose.promise;
            return close(closeContext);
          };
        }
        storages.push(storage);
        return Object.assign(storage, {
          isOwner: async () => storage.owner,
        });
      },
      storageExists: async () => storages.length > 0,
      createRegistry: () => createRegistry(),
      models,
      agent: { model },
    },
    {
      maxTurns: 8,
      crashLoopRestarts: Infinity,
      requestSlots: createRequestSlots(1),
    },
    context,
  );
  const first = await conversations.create(chatId);
  const [firstStorage] = storages;
  if (firstStorage === undefined) throw new Error("No storage opened.");
  firstStorage.owner = false;
  const second = await conversations.create(chatId);
  expect(second.harness).not.toBe(first.harness);

  let registryClosed = false;
  const closing = conversations.close().then(() => {
    registryClosed = true;
  });
  await second.harness.closed;
  await sleep(20);
  expect(registryClosed).toBe(false);

  releaseClose.resolve();
  await closing;
  expect(await first.harness.closed).toEqual({ kind: "closed" });
});

test("a stored extension list without the gate keeps exactly its extensions, plus the gate", async () => {
  const storage = Object.assign(new MemoryStorage(), {
    isOwner: async () => true,
    close: async () => {},
  });
  const extra = defineExtension({ name: "extra" });
  const installAll = () => {
    const registry = createRegistry();
    registry.install(browserCallExtension);
    registry.install(extra);
    return registry;
  };
  const { models, model } = scriptedModel([]);
  // A conversation stored before the server selected the gate.
  const before = await Harness.open(
    storage,
    { models, registry: installAll() },
    context,
  );
  await before.root(context, {
    agent: { model, extensions: [browserCallExtension] },
  });
  await before.close(context);

  const conversations = createConversationRegistry(
    {
      openStorage: async () => storage,
      storageExists: async () => true,
      createRegistry: installAll,
      models,
      agent: { model },
    },
    {
      maxTurns: 8,
      crashLoopRestarts: Infinity,
      requestSlots: createRequestSlots(1),
    },
    context,
  );
  try {
    const { harness, root } = (await conversations.acquire(chatId))!;
    expect(
      (await harness.snapshot(AgentDoc, root.id, context))?.extensions,
    ).toEqual([browserCallExtension.name, requestSlotsExtensionName]);
    expect(
      (await root.agent(context)).extensions.map(({ name }) => name),
    ).toEqual([browserCallExtension.name, requestSlotsExtensionName]);
  } finally {
    await conversations.close();
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
