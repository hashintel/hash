import { createHash } from "node:crypto";

import { expect, test, vi } from "vitest";

import { BrunchPanelConversationTracker } from "../brunch-panel-transport";
import { requestSuccessorStop } from "./request-successor-stop";

const conversation = {
  endpoint: "http://durable.test",
  actorKey: "actor-1",
  conversationId: "conversation-1",
  web: "web-1",
};
const instanceId = createHash("sha256")
  .update(`${conversation.actorKey}\0${conversation.conversationId}`)
  .digest("hex");

test("stops the conversation's instance once the sends in flight have been answered, and reports only that a stop was requested", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response(null, { status: 204 }),
  );
  const tracker = new BrunchPanelConversationTracker();
  const stopRequested = vi.fn();
  tracker.subscribeToStopRequested(stopRequested);
  let admit!: () => void;
  void tracker.trackSubmission(
    new Promise<void>((resolve) => {
      admit = resolve;
    }),
  );

  const stopping = requestSuccessorStop({ ...conversation, fetch }, tracker);
  await new Promise((resolve) => {
    setTimeout(resolve, 10);
  });
  expect(stopRequested).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled();
  admit();

  await expect(stopping).resolves.toBe("stop-requested");
  expect(fetch).toHaveBeenCalledOnce();
  const [url, init] = fetch.mock.calls[0]!;
  expect(url).toBe(`http://durable.test/chat/${instanceId}/abort`);
  expect(init).toMatchObject({ method: "POST", credentials: "include" });
  const headers = new Headers(init?.headers);
  expect(headers.get("x-brunch-conversation")).toBe("conversation-1");
  expect(headers.get("x-brunch-web")).toBe("web-1");
});

test("a stop the server could not be asked for rejects", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    throw new TypeError("Failed to fetch");
  });

  await expect(
    requestSuccessorStop(
      { ...conversation, fetch },
      new BrunchPanelConversationTracker(),
    ),
  ).rejects.toThrow("Failed to fetch");
});
