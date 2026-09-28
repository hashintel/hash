import { expect, test } from "vitest";

import { createLiveToolBroadcaster } from "./live-tool-broadcaster";
import { liveToolResponse } from "./live-tool-response";

const instanceId = "live-route-instance";
const request = (query = "?submissionId=submission-1") =>
  new Request(`http://transport.test/agents/chat/${instanceId}/live${query}`);

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
