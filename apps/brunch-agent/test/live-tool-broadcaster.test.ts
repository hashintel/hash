import { expect, test } from "vitest";

import { createLiveToolBroadcaster } from "../src/agents/chat-agent/live/live-tool-broadcaster.ts";

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
    toolName: "read_workpiece",
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

test("drops a slow subscriber instead of backpressuring publication", async () => {
  const broadcaster = createLiveToolBroadcaster({ maxQueuedEvents: 1 });
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
