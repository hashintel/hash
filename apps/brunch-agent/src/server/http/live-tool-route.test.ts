import { Hono } from "hono";
import { expect, test } from "vitest";

import { agentOwnershipHeaders } from "@hashintel/brunch-agent";
import {
  createLiveToolBroadcaster,
  liveToolResponse,
  liveToolRouteSegment,
} from "@local/flue-aisdk-transport/server";

import { flueConversationId } from "../../shared/conversation/identity.ts";
import { agentOwnershipGuard } from "./ownership.ts";

const mount = "/agents/chat";
const identity = {
  conversationId: "live-route-conversation",
  ownerKey: "live-route-owner",
};
const instanceId = flueConversationId(identity);
const url = `http://brunch.test${mount}/${instanceId}/${liveToolRouteSegment}?submissionId=submission-1`;

test("guards the live SSE route with the existing conversation ownership", async () => {
  const broadcaster = createLiveToolBroadcaster();
  const app = new Hono();
  app.use(`${mount}/*`, agentOwnershipGuard(`${mount}/`, "chat-agent"));
  app.get(`${mount}/:id/${liveToolRouteSegment}`, (context) =>
    liveToolResponse(broadcaster, {
      instanceId: context.req.param("id"),
      request: context.req.raw,
    }),
  );

  const missing = await app.request(url);
  expect(missing.status).toBe(401);

  const forbidden = await app.request(url, {
    headers: agentOwnershipHeaders({
      ...identity,
      ownerKey: "another-owner",
    }),
  });
  expect(forbidden.status).toBe(403);

  const response = await app.request(url, {
    headers: agentOwnershipHeaders(identity),
  });
  expect(response.status).toBe(200);
  await response.body?.cancel();
  broadcaster.close();
});
