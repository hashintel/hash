import { expect, test } from "vitest";

import { reduceUiMessageChunks } from "./ai-sdk-oracle";

import type { UIMessageChunk } from "ai";

test("rejects a chunk the AI SDK wire schema refuses", async () => {
  await expect(
    reduceUiMessageChunks([
      { type: "text-start" } as unknown as UIMessageChunk,
    ]),
  ).rejects.toThrow("The AI SDK wire schema rejects");
});

test("rejects a sequence the AI SDK reducer refuses", async () => {
  await expect(
    reduceUiMessageChunks([{ type: "text-delta", id: "t-1", delta: "x" }]),
  ).rejects.toThrow('Received text-delta for missing text part with ID "t-1"');
});
