import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type Conversation,
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
import {
  bindBrowserDocument,
  browserCallExtension,
  BrowserCallsDoc,
  type BrowserCallStatus,
  claimBrowserCall,
  finishBrowserCall,
  setNetTitleTool,
} from "../../browser-call/browser-call";
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
 * An earlier turn of the conversation whose `setNetTitle` call the browser
 * answered without ringing the doorbell (a crash between the outcome commit
 * and the ring), then aborted before its task collected the outcome.
 */
const runDiscardingTurn = async (harness: Harness, root: Conversation) => {
  await harness.commit(
    (tx) =>
      bindBrowserDocument(tx, root.id, {
        conversationId: chatId,
        documentId: "net-1",
      }),
    context,
  );
  const submission = await root.submit(
    { type: "input", content: "Title it." },
    context,
  );
  const record = async () =>
    (await harness.snapshot(BrowserCallsDoc, root.id, context))?.calls[
      discardedCallId
    ];
  await vi.waitFor(async () => {
    expect(typeof (await record())?.doorbell).toBe("number");
  });
  await claimBrowserCall(harness, root.id, discardedCallId, context);
  await harness.commit(async (tx) => {
    const call = (await tx.doc(BrowserCallsDoc, root.id)).calls[
      discardedCallId
    ]!;
    call.status = "finished";
    call.output = { applied: true };
  }, context);
  await root.abort(context);
  expect((await submission.wait(context)).status).toBe("unanswered");
  expect((await record())?.status).toBe("discarded");
};

const discardedCallId = "discarded-call";

/**
 * A conversation from the production registry on MemoryStorage whose turn is
 * running a real tool that waits for its abort. Only the storage's ownership
 * read and, on request, the monitor's snapshot reads are controlled; the
 * monitor's clock and timers are faked once the tool has started. With
 * `afterDiscardingTurn`, the turn follows one that `runDiscardingTurn` ran.
 */
const openWaitingTurn = async ({ afterDiscardingTurn = false } = {}) => {
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
    ...(afterDiscardingTurn
      ? [
          fauxAssistantMessage(
            fauxToolCall(
              "setNetTitle",
              { title: "Net" },
              { id: discardedCallId },
            ),
            { stopReason: "toolUse" },
          ),
        ]
      : []),
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
        registry.install(browserCallExtension);
        return registry;
      },
      models,
      agent: { model, extensions: [extension, browserCallExtension] },
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
    if (afterDiscardingTurn) await runDiscardingTurn(harness, root);
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
      /** Record a browser call of the turn in `status`, expiring `expiresInMs` from now. */
      seedCall: (status: BrowserCallStatus, expiresInMs: number) =>
        harness.commit(async (tx) => {
          const { calls } = await tx.doc(BrowserCallsDoc, root.id);
          calls.seeded = {
            toolCallId: "seeded",
            toolName: "petrinaut_get_net",
            input: {},
            status,
            issuedAt: Date.now(),
            expiresAt: Date.now() + expiresInMs,
            task: 0,
            doorbell: null,
            capability: null,
            claimed: status !== "pending",
            output: null,
            metadata: null,
          };
        }, context),
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

test.each([
  { status: "pending", expiresInMs: 60_000, aborted: true },
  { status: "claimed", expiresInMs: 60_000, aborted: false },
  { status: "claimed", expiresInMs: 0, aborted: true },
  { status: "finished", expiresInMs: 60_000, aborted: false },
  { status: "finished", expiresInMs: 0, aborted: false },
  { status: "failed", expiresInMs: 0, aborted: false },
  { status: "settled", expiresInMs: 60_000, aborted: true },
  { status: "failure-settled", expiresInMs: 60_000, aborted: true },
  { status: "discarded", expiresInMs: 60_000, aborted: true },
  { status: "expired", expiresInMs: 0, aborted: true },
  { status: "stopped", expiresInMs: 60_000, aborted: true },
] as const)(
  "a $status call expiring in $expiresInMs ms leaves the unwatched turn aborted=$aborted",
  async ({ status, expiresInMs, aborted }) => {
    const fixture = await openWaitingTurn();
    try {
      await fixture.seedCall(status, expiresInMs);
      fixture.turns.opened(chatId);
      await vi.advanceTimersByTimeAsync(timeoutMs * 4);
      expect((await fixture.outcome()).running).toBe(!aborted);
    } finally {
      await fixture.close();
    }
  },
);

test("an unwatched turn after one aborted with an answered call is still aborted", async () => {
  const fixture = await openWaitingTurn({ afterDiscardingTurn: true });
  try {
    fixture.turns.opened(chatId);
    await vi.advanceTimersByTimeAsync(timeoutMs * 4);
    expect(await fixture.outcome()).toEqual({
      running: false,
      failure: "aborted",
    });
  } finally {
    await fixture.close();
  }
});

test("a sweep between a call's collection and its tool result does not abort the turn", async () => {
  const toolReturned = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  // The waiting tool, paused after its call was collected and before Pi commits its result.
  const gated = defineExtension({
    name: "test.gated-browser-tool",
    tools: [
      defineTool({
        ...setNetTitleTool,
        execute: async (args, api, toolContext) => {
          const result = await setNetTitleTool.execute(args, api, toolContext);
          toolReturned.resolve();
          await release.promise;
          return result;
        },
      }),
    ],
    tasks: browserCallExtension.tasks,
  });
  const callId = "gated-call";
  const { models, model } = scriptedModel([
    fauxAssistantMessage(
      fauxToolCall("setNetTitle", { title: "Net" }, { id: callId }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("Done."),
  ]);
  const storage = Object.assign(new MemoryStorage(), {
    isOwner: async () => true,
  });
  const conversations = createConversationRegistry(
    {
      openStorage: async () => storage,
      storageExists: async () => false,
      createRegistry: () => {
        const registry = createRegistry();
        registry.install(gated);
        return registry;
      },
      models,
      agent: { model, extensions: [gated] },
    },
    {
      maxTurns: 100,
      crashLoopRestarts: 5,
      requestSlots: createRequestSlots(1),
    },
    context,
  );
  const turns = createAbandonedTurns({
    timeoutMs,
    ifOwned: (conversationId) => conversations.ifOwned(conversationId),
    context,
    // The faked clock, once the timers are faked below.
    now: () => Date.now(),
  });
  try {
    const { harness, root } = await conversations.create(chatId, {
      binding: { conversationId: chatId, documentId: "net-1" },
    });
    const submission = await root.submit(
      { type: "input", content: "Title it." },
      context,
    );
    const record = async () =>
      (await harness.snapshot(BrowserCallsDoc, root.id, context))?.calls[
        callId
      ];
    await vi.waitFor(async () => {
      expect(typeof (await record())?.doorbell).toBe("number");
    });
    const claimed = await claimBrowserCall(harness, root.id, callId, context);
    await finishBrowserCall(
      harness,
      {
        conversationId: root.id,
        toolCallId: callId,
        toolName: "setNetTitle",
        capability: claimed!.capability,
        canonicalInput: claimed!.input,
        output: { applied: true },
      },
      context,
    );
    await toolReturned.promise;
    expect((await record())?.status).toBe("settled");

    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    turns.opened(chatId);
    await vi.advanceTimersByTimeAsync(timeoutMs * 4);
    vi.useRealTimers();

    release.resolve();
    expect((await submission.wait(context)).status).toBe("done");
    expect(
      (await harness.snapshot(LiveDoc, root.id, context))?.runFailure,
    ).toBeUndefined();
  } finally {
    release.resolve();
    turns.close();
    vi.useRealTimers();
    await conversations.close();
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

test("a transient ownership read is retried, but confirmed loss stops checks", async () => {
  const fixture = await openWaitingTurn();
  try {
    fixture.setOwnerRead(async () => {
      throw new Error("temporary read failure");
    });
    fixture.turns.opened(chatId);
    await vi.advanceTimersByTimeAsync(timeoutMs);
    expect(fixture.ownershipChecks()).toBe(1);
    expect((await fixture.live())?.run).toBeDefined();
    fixture.setOwnerRead(async () => false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fixture.ownershipChecks()).toBe(2);
    expect((await fixture.live())?.run).toBeDefined();
  } finally {
    await fixture.close();
  }
});

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
