/**
 * The browser-call lifecycle as one table: each status, before and after its
 * deadline, against each browser event, with what the event returns and the
 * status it leaves. Then the task's own events: collecting a failed call, and
 * a wait that ends before the deadline without an outcome.
 */
import { setTimeout as sleep } from "node:timers/promises";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type ConversationId,
  createRegistry,
  Harness,
  MemoryStorage,
  type TaskId,
} from "@earendil-works/pi-durable";
import { describe, expect, test, vi } from "vitest";

import {
  browserCallEndedWithoutResult,
  browserCallUnstartedRefusal,
  browserToolFacts,
} from "@hashintel/brunch-agent";

import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../../test/scripted-model";
import {
  bindBrowserDocument,
  browserCallExtension,
  type BrowserCallRecord,
  BrowserCallsDoc,
  type BrowserCallStatus,
  claimBrowserCall,
  claimBrowserCallAs,
  failBrowserCall,
  finishBrowserCall,
  isAdmittable,
  isAnsweredUncollected,
  isAwaitingBrowser,
  isHeld,
  renewBrowserCall,
  startBrowserCall,
  withBrowserClaimDecision,
} from "./browser-call";

const context = BACKGROUND_CONTEXT;
const toolCallId = "call-1";
const binding = "binding-1";
const capability = "capability-1";
const input = { title: "Net" };
const expiresAt = 1_000;
const clocks = { live: () => 0, late: () => expiresAt } as const;

/** A call in `status` as the owner leaves it: a capability once claimed, dropped when it expires or stops. */
const recordIn = (status: BrowserCallStatus): BrowserCallRecord => ({
  toolCallId,
  toolName: "setNetTitle",
  input,
  status,
  issuedAt: 0,
  expiresAt,
  task: 0,
  doorbell: null,
  capability:
    status === "pending" || status === "expired" || status === "stopped"
      ? null
      : capability,
  claimed: status !== "pending",
  output: null,
  metadata: null,
  binding,
  claimant: "tab-1",
  started: false,
});

const openWith = async (status: BrowserCallStatus) => {
  const { models, model } = scriptedModel([]);
  const registry = createRegistry();
  registry.install(browserCallExtension);
  const harness = await Harness.open(
    new MemoryStorage(),
    { models, registry },
    context,
  );
  const root = await harness.root(context, { agent: { model } });
  await harness.commit(async (tx) => {
    const { calls } = await tx.doc(BrowserCallsDoc, root.id);
    calls[toolCallId] = recordIn(status);
  }, context);
  const statusNow = async () =>
    (await harness.snapshot(BrowserCallsDoc, root.id, context))?.calls[
      toolCallId
    ]?.status;
  return { harness, conversationId: root.id, statusNow };
};

const proof = { capability, binding };
const claim = {
  toolName: "setNetTitle",
  capability,
  canonicalInput: input,
  binding,
};

/** Each browser event, by name: what it returns. */
const events = {
  claim: (harness: Harness, id: ConversationId, now: () => number) =>
    claimBrowserCall(harness, id, toolCallId, context, now).then(
      (claimed) => claimed !== undefined,
    ),
  claimAs: (harness: Harness, id: ConversationId, now: () => number) =>
    claimBrowserCallAs(
      harness,
      id,
      toolCallId,
      { claimant: "tab-2", binding },
      context,
      now,
    ).then(({ status }) => status),
  start: (harness: Harness, id: ConversationId, now: () => number) =>
    startBrowserCall(harness, id, toolCallId, proof, context, now),
  renew: (harness: Harness, id: ConversationId, now: () => number) =>
    renewBrowserCall(harness, id, toolCallId, proof, context, now),
  finish: (harness: Harness, id: ConversationId, now: () => number) =>
    finishBrowserCall(
      harness,
      { conversationId: id, toolCallId, ...claim, output: { applied: true } },
      context,
      now,
    ),
  fail: (harness: Harness, id: ConversationId, now: () => number) =>
    failBrowserCall(
      harness,
      { conversationId: id, toolCallId, ...claim, disposition: "unstarted" },
      context,
      now,
    ),
};

type Expected = {
  readonly [Event in keyof typeof events]: readonly [
    Awaited<ReturnType<(typeof events)[Event]>>,
    BrowserCallStatus,
  ];
};

/** Before the deadline: `[returned, status after]` per event. */
const live: Record<BrowserCallStatus, Expected> = {
  pending: {
    claim: [true, "claimed"],
    claimAs: ["claimed", "claimed"],
    start: ["refused", "pending"],
    renew: [false, "pending"],
    finish: ["not-issued", "pending"],
    fail: ["not-issued", "pending"],
  },
  claimed: {
    claim: [false, "claimed"],
    // Unstarted: another tab takes it over.
    claimAs: ["claimed", "claimed"],
    start: ["started", "claimed"],
    renew: [true, "claimed"],
    finish: ["settled", "finished"],
    fail: ["failed", "failed"],
  },
  finished: {
    claim: [false, "finished"],
    claimAs: ["ended", "finished"],
    start: ["refused", "finished"],
    renew: [false, "finished"],
    // A retry after a crash between the commit and the ring rings again.
    finish: ["settled", "finished"],
    fail: ["not-issued", "finished"],
  },
  failed: {
    claim: [false, "failed"],
    claimAs: ["ended", "failed"],
    start: ["refused", "failed"],
    renew: [false, "failed"],
    finish: ["not-issued", "failed"],
    fail: ["failed", "failed"],
  },
  settled: {
    claim: [false, "settled"],
    claimAs: ["ended", "settled"],
    start: ["refused", "settled"],
    renew: [false, "settled"],
    finish: ["settled", "settled"],
    fail: ["not-issued", "settled"],
  },
  "failure-settled": {
    claim: [false, "failure-settled"],
    claimAs: ["ended", "failure-settled"],
    start: ["refused", "failure-settled"],
    renew: [false, "failure-settled"],
    finish: ["not-issued", "failure-settled"],
    fail: ["failed", "failure-settled"],
  },
  expired: {
    claim: [false, "expired"],
    claimAs: ["ended", "expired"],
    start: ["refused", "expired"],
    renew: [false, "expired"],
    finish: ["not-issued", "expired"],
    fail: ["not-issued", "expired"],
  },
  stopped: {
    claim: [false, "stopped"],
    claimAs: ["ended", "stopped"],
    start: ["refused", "stopped"],
    renew: [false, "stopped"],
    finish: ["not-issued", "stopped"],
    fail: ["not-issued", "stopped"],
  },
};

/** Every status, from the table keyed by the union, so none can be left out. */
const statuses = Object.keys(live) as BrowserCallStatus[];

/** At the deadline nothing is admitted; a retry still gets its committed outcome's receipt. */
const late = Object.fromEntries(
  statuses.map((status): [string, Expected] => [
    status,
    {
      claim: [false, status],
      claimAs: ["ended", status],
      start: ["refused", status],
      renew: [false, status],
      finish:
        live[status].finish[1] === status
          ? live[status].finish
          : ["not-issued", status],
      fail:
        live[status].fail[1] === status
          ? live[status].fail
          : ["not-issued", status],
    },
  ]),
) as Record<BrowserCallStatus, Expected>;

describe.each([
  ["before the deadline", clocks.live, live],
  ["at the deadline", clocks.late, late],
] as const)("%s", (_, now, table) => {
  test.each(
    statuses.flatMap((status) =>
      (Object.keys(events) as (keyof typeof events)[]).map(
        (event) => [status, event] as const,
      ),
    ),
  )("%s, %s", async (status, event) => {
    const { harness, conversationId, statusNow } = await openWith(status);
    try {
      const returned = await events[event](harness, conversationId, now);
      expect([returned, await statusNow()]).toEqual(table[status][event]);
    } finally {
      await harness.close(context);
    }
  });
});

test.each(statuses)("%s falls in the categories its readers ask", (status) => {
  const record = recordIn(status);
  expect({
    awaiting: isAwaitingBrowser(record),
    answeredUncollected: isAnsweredUncollected(record),
    admittable: [isAdmittable(record, 0), isAdmittable(record, expiresAt)],
    held: [isHeld(record, 0), isHeld(record, expiresAt)],
  }).toEqual({
    awaiting: status === "pending" || status === "claimed",
    answeredUncollected: status === "finished" || status === "failed",
    admittable: [status === "pending" || status === "claimed", false],
    held: [
      status === "claimed" || status === "finished" || status === "failed",
      status === "finished" || status === "failed",
    ],
  });
});

/** A turn whose one `setNetTitle` call waits for the browser. */
const openWaitingCall = async () => {
  const { models, model } = scriptedModel([
    fauxAssistantMessage(
      fauxToolCall("setNetTitle", input, { id: toolCallId }),
      {
        stopReason: "toolUse",
      },
    ),
    fauxAssistantMessage("Done."),
  ]);
  const registry = createRegistry();
  registry.install(browserCallExtension);
  const harness = await Harness.open(
    new MemoryStorage(),
    { models, registry },
    context,
  );
  const root = await harness.root(context, {
    agent: { model, extensions: [browserCallExtension] },
  });
  await harness.commit(
    (tx) =>
      bindBrowserDocument(tx, root.id, {
        conversationId: "conversation-1",
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
      toolCallId
    ];
  await vi.waitFor(async () => {
    expect(typeof (await record())?.doorbell).toBe("number");
  });
  const resultText = async () => {
    const { messages } = await root.context(context);
    const result = messages.find(
      (message) =>
        message.role === "toolResult" && message.toolCallId === toolCallId,
    );
    return result?.role === "toolResult"
      ? result.content.flatMap((part) =>
          part.type === "text" ? [part.text] : [],
        )
      : undefined;
  };
  return { harness, root, submission, record, resultText };
};

test("a collected failure is delivered once: a retried report is acknowledged without a second wake", async () => {
  const { harness, root, submission, record, resultText } =
    await openWaitingCall();
  try {
    const claimed = await claimBrowserCall(
      harness,
      root.id,
      toolCallId,
      context,
    );
    const failure = {
      conversationId: root.id,
      toolCallId,
      toolName: "setNetTitle",
      capability: claimed!.capability,
      canonicalInput: claimed!.input,
      disposition: "unstarted" as const,
    };
    expect(await failBrowserCall(harness, failure, context)).toBe("failed");
    expect((await submission.wait(context)).status).toBe("done");
    expect((await record())?.status).toBe("failure-settled");
    expect(await resultText()).toEqual([browserCallUnstartedRefusal]);

    expect(await failBrowserCall(harness, failure, context)).toBe("failed");
    expect((await record())?.status).toBe("failure-settled");
  } finally {
    await harness.close(context);
  }
});

test.each([
  ["unclaimed", false, browserCallUnstartedRefusal],
  [
    "claimed single-shot, so maybe run",
    true,
    browserCallEndedWithoutResult(
      "stopped",
      !browserToolFacts("setNetTitle").effectUnknownOnFailure,
    ),
  ],
] as const)(
  "a wait that ends before the deadline without an outcome stops the call, not expires it (%s)",
  async (_, claim, text) => {
    const { harness, root, submission, record, resultText } =
      await openWaitingCall();
    try {
      if (claim) await claimBrowserCall(harness, root.id, toolCallId, context);
      await harness.abortTask((await record())!.doorbell as TaskId, context);
      expect((await submission.wait(context)).status).toBe("done");
      expect((await record())?.status).toBe("stopped");
      expect((await record())?.capability).toBeNull();
      expect(await resultText()).toEqual([text]);
    } finally {
      await harness.close(context);
    }
  },
);

test("a conversation abort stops a call still awaiting the browser", async () => {
  const { harness, root, record } = await openWaitingCall();
  try {
    await root.abort(context);
    await vi.waitFor(async () => {
      expect((await record())?.status).toBe("stopped");
    });
    expect((await record())?.capability).toBeNull();
  } finally {
    await harness.close(context);
  }
});

test.each(["finish", "fail"] as const)(
  "a %s waits for a claim decision in flight, so the abandonment sweep never reads between them",
  async (outcome) => {
    const { harness, root, record } = await openWaitingCall();
    try {
      const claimed = await claimBrowserCall(
        harness,
        root.id,
        toolCallId,
        context,
      );
      const proofOf = {
        conversationId: root.id,
        toolCallId,
        toolName: "setNetTitle",
        capability: claimed!.capability,
        canonicalInput: claimed!.input,
      };
      const decision = Promise.withResolvers<void>();
      const sweep = withBrowserClaimDecision(harness, () => decision.promise);
      const answering =
        outcome === "finish"
          ? finishBrowserCall(harness, { ...proofOf, output: null }, context)
          : failBrowserCall(
              harness,
              { ...proofOf, disposition: "failed" },
              context,
            );
      await sleep(50);
      expect((await record())?.status).toBe("claimed");
      decision.resolve();
      await sweep;
      await answering;
      expect((await record())?.status).not.toBe("claimed");
    } finally {
      await harness.close(context);
    }
  },
);
