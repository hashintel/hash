import { expect, test, vi } from "vitest";

import { createLiveToolBroadcaster } from "./live-tool-broadcaster";

const startEvent = (
  instanceId: string,
  submissionId: string,
  toolCallId: string,
) =>
  ({
    instanceId,
    kind: "tool-input-start",
    submissionId,
    toolCallId,
    toolName: "lookup",
    turnId: "turn-1",
  }) as const;

test("fans live events out only to the correlated instance and submission in order", async () => {
  const broadcaster = createLiveToolBroadcaster();
  const first = broadcaster.subscribe("instance-a", "submission-a");
  const second = broadcaster.subscribe("instance-b", "submission-b");
  const sameInstance = broadcaster.subscribe("instance-a", "submission-other");
  const firstIterator = first.events[Symbol.asyncIterator]();
  const secondIterator = second.events[Symbol.asyncIterator]();
  const sameInstanceIterator = sameInstance.events[Symbol.asyncIterator]();

  broadcaster.publish(startEvent("instance-a", "submission-a", "call-a"));
  broadcaster.publish({
    ...startEvent("instance-a", "submission-a", "call-a"),
    kind: "tool-input-delta",
    inputTextDelta: '{"includeContent":',
  });
  broadcaster.publish(startEvent("instance-b", "submission-b", "call-b"));
  broadcaster.publish(
    startEvent("instance-a", "submission-other", "call-other"),
  );
  broadcaster.publish(startEvent("instance-a", "submission-a", "call-a-2"));

  await expect(firstIterator.next()).resolves.toMatchObject({
    done: false,
    value: { kind: "tool-input-start", sequence: 0, toolCallId: "call-a" },
  });
  await expect(firstIterator.next()).resolves.toMatchObject({
    done: false,
    value: { kind: "tool-input-delta", sequence: 1, toolCallId: "call-a" },
  });
  await expect(firstIterator.next()).resolves.toMatchObject({
    done: false,
    value: { kind: "tool-input-start", sequence: 3, toolCallId: "call-a-2" },
  });
  await expect(secondIterator.next()).resolves.toMatchObject({
    done: false,
    value: { kind: "tool-input-start", sequence: 0, toolCallId: "call-b" },
  });
  await expect(sameInstanceIterator.next()).resolves.toMatchObject({
    done: false,
    value: { kind: "tool-input-start", sequence: 2, toolCallId: "call-other" },
  });

  first.close();
  second.close();
  sameInstance.close();
  broadcaster.close();
});

test("catches up an initial subscriber without retaining unbounded listeners", async () => {
  const broadcaster = createLiveToolBroadcaster();
  broadcaster.publish(startEvent("instance-a", "submission-a", "call-a"));
  const subscription = broadcaster.subscribe("instance-a", "submission-a");
  const iterator = subscription.events[Symbol.asyncIterator]();
  await expect(iterator.next()).resolves.toMatchObject({
    value: { kind: "tool-input-start", toolCallId: "call-a" },
  });
  subscription.close();
  expect(broadcaster.stats()).toEqual({ instances: 1, subscribers: 0 });

  const emptyBroadcaster = createLiveToolBroadcaster();
  for (let index = 0; index < 20; index += 1) {
    emptyBroadcaster
      .subscribe(`instance-${index}`, `submission-${index}`)
      .close();
  }
  expect(emptyBroadcaster.stats()).toEqual({ instances: 0, subscribers: 0 });
  broadcaster.close();
  emptyBroadcaster.close();
});

test.each([
  [1, 2],
  [2, 2],
])(
  "rejects %i queued events for %i retained, leaving no room after replay",
  (maxQueuedEvents, maxRetainedEvents) => {
    expect(() =>
      createLiveToolBroadcaster({ maxQueuedEvents, maxRetainedEvents }),
    ).toThrow("must retain fewer events than a subscriber can queue");
  },
);

test("keeps a subscriber that joins after a full retained window", async () => {
  const broadcaster = createLiveToolBroadcaster();
  for (let index = 0; index < 64; index += 1) {
    broadcaster.publish(
      startEvent("instance-a", "submission-a", `old-${index}`),
    );
  }
  const subscription = broadcaster.subscribe("instance-a", "submission-a");
  broadcaster.publish(startEvent("instance-a", "submission-a", "first-live"));

  expect(broadcaster.stats().subscribers).toBe(1);
  const received: string[] = [];
  const iterator = subscription.events[Symbol.asyncIterator]();
  for (let index = 0; index < 65; index += 1) {
    // Replay and live delivery are read in order.
    // eslint-disable-next-line no-await-in-loop
    const next = await iterator.next();
    if (!next.done && "toolCallId" in next.value) {
      received.push(next.value.toolCallId);
    }
  }
  expect(received.at(-1)).toBe("first-live");
  broadcaster.close();
});

test("drops a slow subscriber instead of backpressuring publication", async () => {
  const broadcaster = createLiveToolBroadcaster({
    maxQueuedEvents: 1,
    maxRetainedEvents: 0,
  });
  const subscription = broadcaster.subscribe("instance-a", "submission-a");
  const iterator = subscription.events[Symbol.asyncIterator]();
  broadcaster.publish(startEvent("instance-a", "submission-a", "call-a"));
  broadcaster.publish({
    ...startEvent("instance-a", "submission-a", "call-a"),
    kind: "tool-input-delta",
    inputTextDelta: "{}",
  });

  expect(broadcaster.stats().subscribers).toBe(0);
  await expect(iterator.next()).resolves.toEqual({
    done: true,
    value: undefined,
  });
  broadcaster.close();
});

test("expires an unattached subscription once its grace window passes and frees its slot", async () => {
  vi.useFakeTimers();
  try {
    const broadcaster = createLiveToolBroadcaster();
    const subscription = broadcaster.subscribe("instance-a", "submission-a");
    const iterator = subscription.events[Symbol.asyncIterator]();

    await vi.advanceTimersByTimeAsync(14_999);
    expect(broadcaster.stats()).toEqual({ instances: 1, subscribers: 1 });

    await vi.advanceTimersByTimeAsync(1);
    expect(broadcaster.stats()).toEqual({ instances: 0, subscribers: 0 });
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
    await expect(subscription.closed).resolves.toBeUndefined();
    broadcaster.close();
  } finally {
    vi.useRealTimers();
  }
});

test("keeps an activated submission alive past the unattached grace window until it finishes", async () => {
  vi.useFakeTimers();
  try {
    const broadcaster = createLiveToolBroadcaster();
    broadcaster.activate("instance-a", "submission-a");
    const subscription = broadcaster.subscribe("instance-a", "submission-a");
    const iterator = subscription.events[Symbol.asyncIterator]();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(broadcaster.stats()).toEqual({ instances: 1, subscribers: 1 });

    broadcaster.publish({
      instanceId: "instance-a",
      kind: "submission-finished",
      outcome: "completed",
      submissionId: "submission-a",
    });
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: { kind: "submission-finished", outcome: "completed" },
    });
    subscription.close();
    broadcaster.close();
  } finally {
    vi.useRealTimers();
  }
});

test("expires an activated instance with no subscribers so missed settlements cannot pin slots", async () => {
  vi.useFakeTimers();
  try {
    const broadcaster = createLiveToolBroadcaster({ maxInstances: 1 });
    broadcaster.activate("instance-a", "submission-a");
    expect(broadcaster.stats()).toEqual({ instances: 1, subscribers: 0 });

    // A new active instance can evict an activated entry that has no subscribers.
    broadcaster.activate("instance-b", "submission-b");
    expect(broadcaster.stats()).toEqual({ instances: 1, subscribers: 0 });

    // After retentionMs with no subscribers, expiration releases the entry too.
    await vi.advanceTimersByTimeAsync(30_000);
    const sub = broadcaster.subscribe("instance-c", "submission-c");
    expect(broadcaster.stats()).toEqual({ instances: 1, subscribers: 1 });
    sub.close();
    broadcaster.close();
  } finally {
    vi.useRealTimers();
  }
});

test("evicts unattached subscriptions rather than refusing capacity or dropping active publications", async () => {
  vi.useFakeTimers();
  try {
    const broadcaster = createLiveToolBroadcaster({ maxInstances: 2 });
    const unattachedA = broadcaster.subscribe("idle-a", "missing-a");
    await vi.advanceTimersByTimeAsync(10);
    const unattachedB = broadcaster.subscribe("idle-b", "missing-b");

    // Activating and subscribing for a real submission evicts the oldest unattached entry.
    broadcaster.activate("active-1", "submission-1");
    const active = broadcaster.subscribe("active-1", "submission-1");
    await expect(unattachedA.closed).resolves.toBeUndefined();
    expect(broadcaster.stats()).toEqual({ instances: 2, subscribers: 2 });

    // Publishing to a second active instance evicts the remaining unattached entry.
    broadcaster.publish(startEvent("active-2", "submission-2", "call-2"));
    await expect(unattachedB.closed).resolves.toBeUndefined();
    const active2 = broadcaster.subscribe("active-2", "submission-2");
    const iterator2 = active2.events[Symbol.asyncIterator]();
    await expect(iterator2.next()).resolves.toMatchObject({
      done: false,
      value: { kind: "tool-input-start", toolCallId: "call-2" },
    });

    // Once all slots hold attached/active subscribers, a new subscription fails capacity.
    expect(() => broadcaster.subscribe("overflow", "submission-3")).toThrow(
      "at subscriber capacity",
    );

    active.close();
    active2.close();
    broadcaster.close();
  } finally {
    vi.useRealTimers();
  }
});
