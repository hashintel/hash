import { expect, test } from "vitest";

import { createBrunchPanelTransport } from "./brunch-panel-transport";

import type { PetrinautAiChatTransport } from "@hashintel/petrinaut/ui";

test("pins send and reconnect to the stable conversation id", async () => {
  const seenChatIds: string[] = [];
  const sourceTransport: PetrinautAiChatTransport = {
    reconnectToStream: async (options) => {
      seenChatIds.push(options.chatId);
      return null;
    },
    sendMessages: async (options) => {
      seenChatIds.push(options.chatId);
      return new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
    },
  };

  const transport = createBrunchPanelTransport(
    sourceTransport,
    "conversation-stable",
  );
  await transport.sendMessages({ chatId: "generated-by-use-chat" } as never);
  await transport.reconnectToStream({
    chatId: "generated-by-use-chat",
  } as never);

  expect(seenChatIds).toEqual(["conversation-stable", "conversation-stable"]);
});
