import { Hono } from "hono";
import { expect, test } from "vitest";

import { INTEGRATED_BRUNCH_MODE } from "@hashintel/brunch-agent-plugin-sdcpn";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import { agentOwnershipGuard } from "../src/http/ownership.ts";
import { CHAT_AGENT_ROUTE } from "../src/http/routes.ts";

const mount = `/agents/${CHAT_AGENT_ROUTE}`;
const app = new Hono();
app.use(`${mount}/*`, agentOwnershipGuard(`${mount}/`, "test-agent"));
app.all(`${mount}/*`, (context) => context.text("admitted"));
const identity = {
  principalKey: "principal-a",
  conversationId: "conversation-1",
};
const url = `http://brunch.test${mount}/${flueConversationIdFrom(identity)}`;

test("the mounted route requires the exact owner", async () => {
  expect((await app.fetch(new Request(url))).status).toBe(401);
  expect(
    (
      await app.fetch(
        new Request(url, {
          headers: agentOwnershipHeaders({
            ...identity,
            principalKey: "other",
          }),
        }),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await app.fetch(
        new Request(url, { headers: agentOwnershipHeaders(identity) }),
      )
    ).status,
  ).toBe(200);
});

test("an I document binding cannot name another conversation", async () => {
  const response = await app.fetch(
    new Request(url, {
      method: "POST",
      headers: {
        ...agentOwnershipHeaders(identity),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        initialData: {
          mode: INTEGRATED_BRUNCH_MODE,
          construction: {
            binding: {
              conversationId: "another",
              documentId: "document",
              incarnationId: "incarnation",
            },
          },
        },
        message: { kind: "user", body: "test" },
      }),
    }),
  );
  expect(response.status).toBe(403);
});
