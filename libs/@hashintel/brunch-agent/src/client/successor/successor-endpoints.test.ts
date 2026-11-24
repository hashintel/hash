import { describe, expect, test } from "vitest";

import { flueConversationIdWeb } from "@hashintel/brunch-agent";

import { successorEndpoints } from "./successor-endpoints";

describe("successorEndpoints", () => {
  test("puts the instance ID in every path, under the server's base", async () => {
    const conversation = {
      endpoint: "https://durable.example.test/",
      actorKey: "actor-1",
      conversationId: "conversation-1",
      web: "web-1",
    };
    const instanceId = await flueConversationIdWeb(conversation);

    expect(await successorEndpoints(conversation)).toEqual({
      instanceId,
      chat: "https://durable.example.test/chat",
      stream: `https://durable.example.test/chat/${instanceId}/stream`,
      abort: `https://durable.example.test/chat/${instanceId}/abort`,
      messages: `https://durable.example.test/chat/${instanceId}/messages`,
      browserCalls: `https://durable.example.test/conversations/${instanceId}/browser-calls`,
      handEdits: `https://durable.example.test/conversations/${instanceId}/browser-calls/hand-edits`,
    });
  });
});
