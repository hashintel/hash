import { Hono } from "hono";
import { expect, test } from "vitest";

import {
  agentOwnershipHeaders,
  brunchHeaders,
  brunchRoutes,
} from "@hashintel/brunch-agent";

import { flueConversationId } from "../../shared/conversation/identity.ts";
import { agentOwnershipGuard } from "./ownership.ts";

const mount = `${brunchRoutes.agents}/${brunchRoutes.petrinautAgent}`;
const app = new Hono();
app.use(`${mount}/*`, agentOwnershipGuard(`${mount}/`, "test-agent"));
app.all(`${mount}/*`, (context) => context.text("admitted"));
const identity = {
  actorKey: "owner-a",
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
            actorKey: "other",
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

test.each([false, true])(
  "the actor header alone, or its former name alone, addresses the conversation (former name: %s)",
  async (legacyActorHeader) => {
    const headers = agentOwnershipHeaders(identity, { legacyActorHeader });
    expect(Object.keys(headers)).toHaveLength(2);
    expect((await app.fetch(new Request(url, { headers }))).status).toBe(200);
    expect(
      (
        await app.fetch(
          new Request(url, {
            headers: agentOwnershipHeaders(
              { ...identity, actorKey: "other" },
              { legacyActorHeader },
            ),
          }),
        )
      ).status,
    ).toBe(403);
  },
);

test("when both headers arrive and differ, the actor header decides", async () => {
  const status = async (actor: string, legacyPrincipal: string) =>
    (
      await app.fetch(
        new Request(url, {
          headers: {
            [brunchHeaders.actor]: actor,
            [brunchHeaders.legacyPrincipal]: legacyPrincipal,
            [brunchHeaders.conversation]: identity.conversationId,
          },
        }),
      )
    ).status;
  expect(await status(identity.actorKey, "other")).toBe(200);
  expect(await status("other", identity.actorKey)).toBe(403);
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
