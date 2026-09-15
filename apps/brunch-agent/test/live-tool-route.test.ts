import { Hono } from "hono";
import { expect, test } from "vitest";

import { createLiveToolBroadcaster } from "../src/agents/chat-agent/live/live-tool-broadcaster.ts";
import { createLiveToolRoute } from "../src/agents/chat-agent/live/live-tool-route.ts";
import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { agentOwnershipGuard } from "../src/http/ownership.ts";

const mount = "/agents/chat";
const identity = {
  conversationId: "live-route-conversation",
  principalKey: "live-route-principal",
};
const instanceId = flueConversationIdFrom(identity);
const url = `http://brunch.test${mount}/${instanceId}/live?submissionId=submission-1`;

const createRouteFixture = () => {
  const broadcaster = createLiveToolBroadcaster();
  const app = new Hono();
  app.use(`${mount}/*`, agentOwnershipGuard(`${mount}/`, "chat-agent"));
  app.get(`${mount}/:id/live`, createLiveToolRoute(broadcaster));
  return { app, broadcaster };
};

test("guards the live SSE route with the existing conversation ownership", async () => {
  const { app, broadcaster } = createRouteFixture();
  const missing = await app.request(url);
  expect(missing.status).toBe(401);

  const forbidden = await app.request(url, {
    headers: agentOwnershipHeaders({
      ...identity,
      principalKey: "another-principal",
    }),
  });
  expect(forbidden.status).toBe(403);

  const response = await app.request(url, {
    headers: agentOwnershipHeaders(identity),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  broadcaster.publish({
    instanceId,
    kind: "tool-input-start",
    submissionId: "submission-1",
    toolCallId: "call-1",
    toolName: "read_workpiece",
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
