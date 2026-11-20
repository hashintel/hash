import { expect, test, vi } from "vitest";

import { canonicalContent } from "@hashintel/brunch-agent";

import { BROWSER_CALL_STALE_MESSAGE } from "../tools/in-band-browser-call";
import { createSuccessorBrowserCalls } from "./successor-browser-calls";

const binding = { conversationId: "conversation", documentId: "document" };
const input = {
  id: "place",
  name: "Place",
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
};

test("a change whose expected revision the document has left fails as stale and never starts", async () => {
  const posted: { route: string; body: unknown }[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    const href = url instanceof Request ? url.url : url.toString();
    const route = href.split("/browser-calls/call")[1] ?? "";
    posted.push({
      route,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return route === ""
      ? Response.json({
          capability: "capability",
          binding: canonicalContent(binding),
          toolName: "addPlace",
          input,
          expectedRevision: "r-seen",
        })
      : Response.json({ failed: true });
  });
  const prepareInput = vi.fn();
  const execute = vi.fn(async () => ({ applied: true }));
  const calls = createSuccessorBrowserCalls({
    conversation: {
      endpoint: "http://durable.test",
      actorKey: "actor",
      conversationId: binding.conversationId,
      web: "web",
      fetch,
    },
    binding,
    claimant: "tab",
    metadataFor: () => undefined,
    prepareInput,
    admit: async () => ({ admitted: true }),
    acceptsRevision: () => false,
  });

  await expect(
    calls.run(
      {
        toolCallId: "call",
        toolName: "addPlace",
        input,
        signal: new AbortController().signal,
      },
      execute,
    ),
  ).rejects.toThrow(BROWSER_CALL_STALE_MESSAGE);

  expect(posted.map(({ route }) => route)).toEqual(["", "/fail"]);
  expect(posted[1]?.body).toMatchObject({ disposition: "stale" });
  expect(prepareInput).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
});
