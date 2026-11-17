import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  createRegistry,
  defineExtension,
  defineTool,
  type Harness,
  LiveDoc,
  MemoryStorage,
} from "@earendil-works/pi-durable";
import { obj } from "@earendil-works/pi-schema";
import { expect, test, vi } from "vitest";

import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../../../test/scripted-model";
import { createAbandonedTurns } from "./abandoned-turns";
import { createConversationRegistry } from "./conversation-registry";
import { createRequestSlots } from "./request-slots";

const context = BACKGROUND_CONTEXT;
const chatId = "abandonment-regression";
const timeoutMs = 20;

/** `harness`, whose snapshot reads each wait for `read` first. */
const holdingSnapshots = (
  harness: Harness,
  read: Promise<void>,
  onHeld: () => void,
): Harness => {
  const snapshot = harness.snapshot.bind(harness);
  return new Proxy(harness, {
    get: (target, key): unknown =>
      key === "snapshot"
        ? async (...args: unknown[]): Promise<unknown> => {
            onHeld();
            await read;
            return Reflect.apply(snapshot, undefined, args);
          }
        : Reflect.get(target, key, target),
  });
};

/** Each paired case: whether a watcher attached during the read, and how the turn ends up. */
const attachCases = [
  { attachDuringRead: false, outcome: { running: false, failure: "aborted" } },
  { attachDuringRead: true, outcome: { running: true, failure: undefined } },
];

/**
 * A conversation from the production registry on MemoryStorage whose turn is
 * running a real tool that waits for its abort. Only the storage's ownership
 * read and, on request, the monitor's snapshot reads are controlled; the
 * monitor's clock and timers are faked once the tool has started.
 */
const openWaitingTurn = async () => {
  let toolEntered = false;
  let ownershipChecks = 0;
  let readOwner: () => Promise<boolean> = async () => true;
  let snapshotRead: Promise<void> | undefined;
  let heldSnapshots = 0;
  const storage = Object.assign(new MemoryStorage(), {
    isOwner: async () => {
      ownershipChecks += 1;
      return readOwner();
    },
  });
  const hold = defineTool({
    name: "hold",
    description: "Wait until the real tool context aborts.",
    parameters: obj({}),
    replay: "safe",
    execute: async (_args, _api, toolContext) => {
      toolEntered = true;
      return new Promise<never>((_resolve, reject) => {
        const signal = toolContext.abortSignal;
        if (signal?.aborted === true) {
          reject(signal.reason);
          return;
        }
        signal?.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    },
  });
  const extension = defineExtension({ name: "test.hold", tools: [hold] });
  const { models, model } = scriptedModel([
    fauxAssistantMessage(fauxToolCall("hold", {}), { stopReason: "toolUse" }),
  ]);
  const conversations = createConversationRegistry(
    {
      openStorage: async () => storage,
      // One initially absent conversation is created; afterwards only `ifOwned` reads it.
      storageExists: async () => false,
      createRegistry: () => {
        const registry = createRegistry();
        registry.install(extension);
        return registry;
      },
      models,
      agent: { model, extensions: [extension] },
    },
    {
      maxTurns: 100,
      crashLoopRestarts: 5,
      requestSlots: createRequestSlots(1),
    },
    context,
  );
  try {
    const { harness, root } = await conversations.create(chatId);
    await root.submit({ type: "input", content: "Wait." }, context);
    await vi.waitFor(() => expect(toolEntered).toBe(true));
    expect(
      (await harness.snapshot(LiveDoc, root.id, context))?.run,
    ).toBeDefined();

    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const turns = createAbandonedTurns({
      timeoutMs,
      ifOwned: async (conversationId) => {
        const conversation = await conversations.ifOwned(conversationId);
        if (conversation === undefined || snapshotRead === undefined)
          return conversation;
        return {
          ...conversation,
          harness: holdingSnapshots(conversation.harness, snapshotRead, () => {
            heldSnapshots += 1;
          }),
        };
      },
      context,
    });
    return {
      turns,
      live: () => harness.snapshot(LiveDoc, root.id, context),
      /** Whether the turn still runs, and why its last run failed, if it did. */
      outcome: async () => {
        const live = await harness.snapshot(LiveDoc, root.id, context);
        return {
          running: live?.run !== undefined,
          failure: live?.runFailure?.reason,
        };
      },
      ownershipChecks: () => ownershipChecks,
      heldSnapshots: () => heldSnapshots,
      setOwnerRead: (next: () => Promise<boolean>) => {
        readOwner = next;
      },
      /** Hold the monitor's snapshot reads until the returned function is called. */
      holdSnapshots: () => {
        const read = Promise.withResolvers<void>();
        snapshotRead = read.promise;
        return read.resolve;
      },
      close: async () => {
        turns.close();
        vi.useRealTimers();
        await conversations.close();
      },
    };
  } catch (error) {
    vi.useRealTimers();
    await conversations.close();
    throw error;
  }
};

test("an unwatched live turn is aborted", async () => {
  const fixture = await openWaitingTurn();
  try {
    fixture.turns.opened(chatId);
    await vi.advanceTimersByTimeAsync(timeoutMs * 4);
    expect(fixture.ownershipChecks()).toBe(1);
    expect((await fixture.live())?.runFailure?.reason).toBe("aborted");
  } finally {
    await fixture.close();
  }
});

test("a continuously watched turn is not checked or aborted", async () => {
  const fixture = await openWaitingTurn();
  try {
    fixture.turns.attach(chatId);
    fixture.turns.opened(chatId);
    await vi.advanceTimersByTimeAsync(timeoutMs * 4);
    expect(fixture.ownershipChecks()).toBe(0);
    expect((await fixture.live())?.run).toBeDefined();
  } finally {
    await fixture.close();
  }
});

test.each(attachCases)(
  "the ownership read resolves after a watcher attached=$attachDuringRead",
  async ({ attachDuringRead, outcome }) => {
    const fixture = await openWaitingTurn();
    const ownership = Promise.withResolvers<boolean>();
    try {
      fixture.setOwnerRead(() => ownership.promise);
      fixture.turns.opened(chatId);
      await vi.advanceTimersByTimeAsync(timeoutMs);
      expect(fixture.ownershipChecks()).toBe(1);
      expect((await fixture.live())?.run).toBeDefined();

      if (attachDuringRead) fixture.turns.attach(chatId);
      ownership.resolve(true);
      await vi.advanceTimersByTimeAsync(timeoutMs * 4);
      expect(await fixture.outcome()).toEqual(outcome);
    } finally {
      ownership.resolve(true);
      await fixture.close();
    }
  },
);

test.each(attachCases)(
  "the snapshot read resolves after a watcher attached=$attachDuringRead",
  async ({ attachDuringRead, outcome }) => {
    const fixture = await openWaitingTurn();
    const release = fixture.holdSnapshots();
    try {
      fixture.turns.opened(chatId);
      await vi.advanceTimersByTimeAsync(timeoutMs);
      expect(fixture.ownershipChecks()).toBe(1);
      expect(fixture.heldSnapshots()).toBe(1);

      if (attachDuringRead) fixture.turns.attach(chatId);
      release();
      await vi.advanceTimersByTimeAsync(timeoutMs * 4);
      expect(await fixture.outcome()).toEqual(outcome);
    } finally {
      release();
      await fixture.close();
    }
  },
);

test("closing the monitor during the ownership read prevents the abort", async () => {
  const fixture = await openWaitingTurn();
  const ownership = Promise.withResolvers<boolean>();
  try {
    fixture.setOwnerRead(() => ownership.promise);
    fixture.turns.opened(chatId);
    await vi.advanceTimersByTimeAsync(timeoutMs);
    expect(fixture.ownershipChecks()).toBe(1);

    fixture.turns.close();
    ownership.resolve(true);
    await vi.advanceTimersByTimeAsync(timeoutMs * 4);
    expect(await fixture.outcome()).toEqual({
      running: true,
      failure: undefined,
    });
  } finally {
    ownership.resolve(true);
    await fixture.close();
  }
});
