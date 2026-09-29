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

test("rejects a delta without its opening chunk", async () => {
  await expect(
    reduceUiMessageChunks([{ type: "text-delta", id: "t-1", delta: "x" }]),
  ).rejects.toThrow('Received text-delta for missing text part with ID "t-1"');
});

test("rejects an output for a tool call the message never opened", async () => {
  await expect(
    reduceUiMessageChunks([
      { type: "start-step" },
      { type: "tool-output-available", toolCallId: "call-1", output: 1 },
    ]),
  ).rejects.toThrow('No tool invocation found for tool call ID "call-1"');
});

test("reports error chunks without treating them as protocol violations", async () => {
  await expect(
    reduceUiMessageChunks([
      { type: "start", messageId: "m-1" },
      { type: "error", errorText: "The turn failed." },
    ]),
  ).resolves.toMatchObject({ streamErrors: ["The turn failed."] });
});
