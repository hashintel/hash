import { expect, test } from "vitest";

import { personaSessionFileText } from "./resume.ts";

import type { PersonaBrowserSession } from "../browser-turn.ts";

const session: PersonaBrowserSession = {
  url: "https://panel.test/agents/petrinaut/conversation",
  actorKey: "TEST-owner",
  conversationId: "TEST-conversation",
  uid: "TEST-uid",
  initialData: {
    binding: {
      conversationId: "TEST-conversation",
      documentId: "TEST-document",
    },
  },
};

test("writes the actor key under its pre-rename field, as earlier runs hold it", () => {
  const { ownerKey, ...rest } = JSON.parse(
    personaSessionFileText(session),
  ) as Record<string, unknown>;
  expect(ownerKey).toBe(session.actorKey);
  expect(rest).not.toHaveProperty("actorKey");
});
