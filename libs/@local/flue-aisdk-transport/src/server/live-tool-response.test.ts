import { expect, test, vi } from "vitest";

import { createLiveToolBroadcaster } from "./live-tool-broadcaster";
import { liveToolResponse } from "./live-tool-response";

const instanceId = "live-route-instance";
const request = (query = "?submissionId=submission-1", init?: RequestInit) =>
  new Request(
    `http://transport.test/agents/chat/${instanceId}/live${query}`,
    init,
  );

const bodyOf = (response: Response) => {
  if (response.body === null) throw new Error("The response has no body.");
  return response.body;
};

test("refuses a subscription without a bounded submission id", () => {
  const broadcaster = createLiveToolBroadcaster();
  expect(
    liveToolResponse(broadcaster, { instanceId, request: request("") }).status,
  ).toBe(400);
  expect(
    liveToolResponse(broadcaster, {
      instanceId,
      request: request(`?submissionId=${"x".repeat(257)}`),
    }).status,
  ).toBe(400);
  expect(
    liveToolResponse(broadcaster, { instanceId: "", request: request() })
      .status,
  ).toBe(400);
  broadcaster.close();
});

test("reports an unavailable broadcaster as 503", () => {
  const broadcaster = createLiveToolBroadcaster();
  broadcaster.close();
  expect(
    liveToolResponse(broadcaster, { instanceId, request: request() }).status,
  ).toBe(503);
});

test("streams one submission as SSE and closes after it finishes", async () => {
  const broadcaster = createLiveToolBroadcaster();
  const response = liveToolResponse(broadcaster, {
    instanceId,
    request: request(),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  broadcaster.publish({
    instanceId,
    kind: "tool-input-start",
    submissionId: "submission-1",
    toolCallId: "call-1",
    toolName: "lookup",
    turnId: "turn-1",
  });
  broadcaster.publish({
    instanceId,
    kind: "submission-finished",
    outcome: "completed",
    submissionId: "submission-1",
  });
  const body = await response.text();
  expect(body).toContain('"kind":"tool-input-start"');
  expect(body).toContain('"kind":"submission-finished"');
  broadcaster.close();
});

test("writes a heartbeat comment after each quiet interval, between events, and none once finished", async () => {
  vi.useFakeTimers();
  try {
    const broadcaster = createLiveToolBroadcaster();
    broadcaster.activate(instanceId, "submission-1");
    const response = liveToolResponse(broadcaster, {
      instanceId,
      request: request(),
    });
    const reader = bodyOf(response).getReader();
    const decoder = new TextDecoder();
    const read = async () =>
      decoder.decode((await reader.read()).value ?? new Uint8Array());

    const firstHeartbeat = read();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await firstHeartbeat).toBe(": heartbeat\n\n");

    const start = read();
    await vi.advanceTimersByTimeAsync(18_000);
    broadcaster.publish({
      instanceId,
      kind: "tool-input-start",
      submissionId: "submission-1",
      toolCallId: "call-1",
      toolName: "lookup",
      turnId: "turn-1",
    });
    expect(await start).toContain('"kind":"tool-input-start"');

    // The event restarted the 30 s quiet interval, so nothing has arrived 18 s
    // later (36 s after the first heartbeat).
    const nextHeartbeat = read();
    await vi.advanceTimersByTimeAsync(18_000);
    expect(
      await Promise.race([nextHeartbeat, Promise.resolve("pending")]),
    ).toBe("pending");
    await vi.advanceTimersByTimeAsync(12_000);
    expect(await nextHeartbeat).toBe(": heartbeat\n\n");

    broadcaster.publish({
      instanceId,
      kind: "submission-finished",
      outcome: "completed",
      submissionId: "submission-1",
    });
    expect(await read()).toContain('"kind":"submission-finished"');
    expect((await reader.read()).done).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    broadcaster.close();
  } finally {
    vi.useRealTimers();
  }
});

test("stops the heartbeat when the client cancels", async () => {
  vi.useFakeTimers();
  try {
    const broadcaster = createLiveToolBroadcaster();
    broadcaster.activate(instanceId, "submission-1");
    const response = liveToolResponse(broadcaster, {
      instanceId,
      request: request(),
    });
    await bodyOf(response).cancel();
    expect(vi.getTimerCount()).toBe(0);
    broadcaster.close();
  } finally {
    vi.useRealTimers();
  }
});

test("skips heartbeats under backpressure, resumes once drained, and stops timers when the subscription ends without a pull", async () => {
  vi.useFakeTimers();
  try {
    const broadcaster = createLiveToolBroadcaster({
      maxQueuedEvents: 1,
      maxRetainedEvents: 0,
    });
    broadcaster.activate(instanceId, "submission-1");
    const response = liveToolResponse(broadcaster, {
      instanceId,
      request: request(),
    });
    const reader = bodyOf(response).getReader();
    const decoder = new TextDecoder();
    const read = async () =>
      decoder.decode((await reader.read()).value ?? new Uint8Array());

    // Advance across several heartbeat intervals without reading: only one
    // heartbeat should be queued instead of growing the buffer without bound.
    await vi.advanceTimersByTimeAsync(180_000);
    expect(await read()).toBe(": heartbeat\n\n");

    // No second heartbeat was buffered during the stall, and heartbeats resume
    // on the next interval now that the reader has drained the buffer.
    const resumedHeartbeat = read();
    expect(
      await Promise.race([resumedHeartbeat, Promise.resolve("pending")]),
    ).toBe("pending");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await resumedHeartbeat).toBe(": heartbeat\n\n");

    // Stall again so one heartbeat fills the queue, then overflow the
    // broadcaster subscriber while pull() is blocked. Termination must clear
    // the timer and close the stream without waiting for another pull().
    await vi.advanceTimersByTimeAsync(60_000);
    broadcaster.publish({
      instanceId,
      kind: "tool-input-start",
      submissionId: "submission-1",
      toolCallId: "call-1",
      toolName: "lookup",
      turnId: "turn-1",
    });
    broadcaster.publish({
      instanceId,
      kind: "tool-input-delta",
      inputTextDelta: "{",
      submissionId: "submission-1",
      toolCallId: "call-1",
      toolName: "lookup",
      turnId: "turn-1",
    });
    broadcaster.publish({
      instanceId,
      kind: "tool-input-delta",
      inputTextDelta: "}",
      submissionId: "submission-1",
      toolCallId: "call-1",
      toolName: "lookup",
      turnId: "turn-1",
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(broadcaster.stats().subscribers).toBe(0);

    // Draining returns the single buffered heartbeat and the event that
    // satisfied the pending pull(), followed by EOF.
    expect(await read()).toBe(": heartbeat\n\n");
    expect(await read()).toContain('"kind":"tool-input-start"');
    expect((await reader.read()).done).toBe(true);
    broadcaster.close();
  } finally {
    vi.useRealTimers();
  }
});

test("closes an unattached stream before any heartbeat and releases its slot", async () => {
  vi.useFakeTimers();
  try {
    const broadcaster = createLiveToolBroadcaster();
    const response = liveToolResponse(broadcaster, {
      instanceId,
      request: request(),
    });
    const text = response.text();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await text).toBe("");
    expect(vi.getTimerCount()).toBe(0);
    expect(broadcaster.stats()).toEqual({ instances: 0, subscribers: 0 });
    broadcaster.close();
  } finally {
    vi.useRealTimers();
  }
});

test("closes the stream and clears timers when the request signal aborts", async () => {
  vi.useFakeTimers();
  try {
    const broadcaster = createLiveToolBroadcaster();
    broadcaster.activate(instanceId, "submission-1");
    const abort = new AbortController();
    const response = liveToolResponse(broadcaster, {
      instanceId,
      request: request("?submissionId=submission-1", { signal: abort.signal }),
    });
    abort.abort();
    expect(vi.getTimerCount()).toBe(0);
    expect(broadcaster.stats().subscribers).toBe(0);
    expect(await response.text()).toBe("");
    broadcaster.close();
  } finally {
    vi.useRealTimers();
  }
});
