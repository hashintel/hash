import { Hono } from "hono";
import { expect, test } from "vitest";

import { agentOwnershipHeaders, brunchRoutes } from "@hashintel/brunch-agent";

import { flueConversationId } from "../../shared/conversation/identity.ts";
import { agentOwnershipGuard } from "./ownership.ts";

const mount = `${brunchRoutes.agents}/${brunchRoutes.petrinautAgent}`;
const app = new Hono();
app.use(`${mount}/*`, agentOwnershipGuard(`${mount}/`, "test-agent"));
app.all(`${mount}/*`, (context) => context.text("admitted"));
const identity = {
  ownerKey: "owner-a",
  conversationId: "conversation-1",
};
const url = `http://brunch.test${mount}/${flueConversationId(identity)}`;

test("the mounted route requires the exact owner", async () => {
  expect((await app.fetch(new Request(url))).status).toBe(401);
  expect(
    (
      await app.fetch(
        new Request(url, {
          headers: agentOwnershipHeaders({
            ...identity,
            ownerKey: "other",
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

test("a document binding cannot name another conversation", async () => {
  const response = await app.fetch(
    new Request(url, {
      method: "POST",
      headers: {
        ...agentOwnershipHeaders(identity),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        initialData: {
          binding: {
            conversationId: "another",
            documentId: "document",
          },
        },
        message: { kind: "user", body: "test" },
      }),
    }),
  );
  expect(response.status).toBe(403);
});
