import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import type { ChatTransport, UIMessage } from "ai";

type SendMessagesOptions = Parameters<
  ChatTransport<UIMessage>["sendMessages"]
>[0];

type PanelPostBody = {
  readonly id: SendMessagesOptions["chatId"];
  readonly messageId?: SendMessagesOptions["messageId"];
  readonly messages: SendMessagesOptions["messages"];
  readonly trigger: SendMessagesOptions["trigger"];
};

const FIXTURES = join(import.meta.dirname, "fixtures");

const readPostBody = (name: string): PanelPostBody =>
  JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as PanelPostBody;

test("validates the load-bearing fields in the complete initial panel POST fixture", () => {
  const body = readPostBody("panel-initial.post.json");
  expect(body.trigger).toBe("submit-message");
  expect(body.messages).toHaveLength(1);
  expect(body.messages[0]?.role).toBe("user");
  expect(body.messages[0]?.parts).toEqual([
    { type: "text", text: "Run the FE-1435 transport probe." },
  ]);
});

test("validates the load-bearing fields in the read-only client-tool follow-up fixture", () => {
  const body = readPostBody("panel-client-tool.post.json");
  expect(body.trigger).toBe("submit-message");
  expect(body.messageId).toBe("assistant-mission-1");
  const assistant = body.messages.find(
    (message) => message.id === body.messageId,
  );
  expect(assistant?.role).toBe("assistant");
  expect(
    assistant?.parts.find((part) => part.type === "tool-readPetrinautDoc"),
  ).toMatchObject({
    type: "tool-readPetrinautDoc",
    toolCallId: "tool-doc-1",
    state: "output-available",
  });
});
