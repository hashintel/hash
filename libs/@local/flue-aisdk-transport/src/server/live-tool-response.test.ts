import { expect, test, vi } from "vitest";

import { createLiveToolBroadcaster } from "./live-tool-broadcaster";
import { liveToolResponse } from "./live-tool-response";

const instanceId = "live-route-instance";
const request = (query = "?submissionId=submission-1") =>
  new Request(`http://transport.test/agents/chat/${instanceId}/live${query}`);

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
    const response = liveToolResponse(broadcaster, {
      instanceId,
      request: request(),
      heartbeatMs: 1_000,
    });
    const reader = bodyOf(response).getReader();
    const decoder = new TextDecoder();
    const read = async () =>
      decoder.decode((await reader.read()).value ?? new Uint8Array());

    const firstHeartbeat = read();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await firstHeartbeat).toBe(": heartbeat\n\n");

    const start = read();
    await vi.advanceTimersByTimeAsync(600);
    broadcaster.publish({
      instanceId,
      kind: "tool-input-start",
      submissionId: "submission-1",
      toolCallId: "call-1",
      toolName: "lookup",
      turnId: "turn-1",
    });
    expect(await start).toContain('"kind":"tool-input-start"');

    // The event restarted the interval, so nothing is due 600 ms later.
    const nextHeartbeat = read();
    await vi.advanceTimersByTimeAsync(600);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(400);
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
    const response = liveToolResponse(broadcaster, {
      instanceId,
      request: request(),
      heartbeatMs: 1_000,
    });
    await bodyOf(response).cancel();
    expect(vi.getTimerCount()).toBe(0);
    broadcaster.close();
  } finally {
    vi.useRealTimers();
  }
});
