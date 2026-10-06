import { expect, test } from "vitest";

import { openRetainedPersonaBrowser } from "./resume.ts";

import type { PersonaBrowserSession } from "../browser-turn.ts";
import type { Page } from "@playwright/test";

const session: PersonaBrowserSession = {
  url: "https://panel.test/agents/chat/conversation",
  principalKey: "TEST-principal",
  conversationId: "TEST-conversation",
  uid: "TEST-uid",
  initialData: {
    binding: {
      conversationId: "TEST-conversation",
      documentId: "TEST-document",
    },
  },
};

const retainedPage = (documents: Record<string, unknown>) => {
  const visited: string[] = [];
  const page = {
    route: async () => {},
    unroute: async () => {},
    goto: async (url: string) => {
      visited.push(url);
      return null;
    },
    evaluate: async () => ({ principal: session.principalKey, documents }),
  };
  return { page: page as unknown as Page, visited };
};

test("reopens the route when the bound document is still stored", async () => {
  const { page, visited } = retainedPage({
    "TEST-document": { id: "TEST-document" },
  });

  await openRetainedPersonaBrowser(page, "https://panel.test", "/", session);

  expect(visited.at(-1)).toBe("https://panel.test/");
});

test("refuses to resume when the bound document is gone", async () => {
  const { page } = retainedPage({ "TEST-other": { id: "TEST-other" } });

  await expect(
    openRetainedPersonaBrowser(page, "https://panel.test", "/", session),
  ).rejects.toThrow("Original browser document is missing");
});
