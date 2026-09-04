/**
 * Ownership middleware on the mounted Flue route, isolated from the Flue
 * runtime: missing identity is 401, a hash mismatch is 403, a matching pair
 * is admitted.
 */

import { Hono } from "hono";
import { expect, test } from "vitest";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { BRUNCH_CONVERSATION_HEADER } from "../src/conversation/payload.ts";
import { agentOwnershipGuard } from "../src/http/ownership.ts";
import { CHAT_AGENT_ROUTE } from "../src/http/routes.ts";

const mount = `/agents/${CHAT_AGENT_ROUTE}`;
const app = new Hono();
app.use(`${mount}/*`, agentOwnershipGuard(`${mount}/`));
app.all(`${mount}/*`, (context) => context.text("admitted"));

const identity = {
  principalKey: "principal-a",
  conversationId: "conversation-1",
};
const instanceId = flueConversationIdFrom(identity);
const conversationUrl = `http://brunch.test${mount}/${instanceId}`;

test("the mounted agent route rejects a request with no ownership headers", async () => {
  const response = await app.fetch(new Request(conversationUrl));
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "unauthorized" });
});

test("the mounted agent route rejects a principal that does not re-derive the id", async () => {
  const response = await app.fetch(
    new Request(conversationUrl, {
      headers: agentOwnershipHeaders({
        principalKey: "principal-other",
        conversationId: identity.conversationId,
      }),
    }),
  );
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "forbidden" });
});

test("the mounted agent route admits a principal and conversation that hash to the id", async () => {
  const response = await app.fetch(
    new Request(conversationUrl, {
      headers: agentOwnershipHeaders(identity),
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("admitted");
});

test("a blank conversation header is unauthorized, not a hash mismatch", async () => {
  const response = await app.fetch(
    new Request(conversationUrl, {
      headers: {
        ...agentOwnershipHeaders(identity),
        [BRUNCH_CONVERSATION_HEADER]: "  ",
      },
    }),
  );
  expect(response.status).toBe(401);
});
