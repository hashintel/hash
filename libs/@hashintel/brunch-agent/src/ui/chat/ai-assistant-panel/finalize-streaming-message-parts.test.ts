import { afterEach, describe, expect, test, vi } from "vitest";

import { finalizeStreamingMessageParts } from "./finalize-streaming-message-parts";

import type { PetrinautAiMessage, PetrinautReasoningMetadata } from "./types";

afterEach(() => {
  vi.useRealTimers();
});

describe("finalizeStreamingMessageParts", () => {
  test("settles a streaming reasoning part and stamps finishedAt", () => {
    const startedAt = Date.parse("2026-05-14T12:00:00Z");
    const now = startedAt + 3_200;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));

    const messages: PetrinautAiMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            state: "streaming",
            text: "Thinking about the model.",
            providerMetadata: { petrinaut: { startedAt } },
          },
        ],
      },
    ];

    const result = finalizeStreamingMessageParts(messages);
    const reasoningPart = result[0]!.parts[0]!;

    expect(reasoningPart.type).toBe("reasoning");
    if (reasoningPart.type !== "reasoning") {
      throw new Error("expected reasoning part");
    }
    expect(reasoningPart.state).toBe("done");

    const metadata = reasoningPart.providerMetadata as
      | PetrinautReasoningMetadata
      | undefined;
    expect(metadata?.petrinaut?.startedAt).toBe(startedAt);
    expect(metadata?.petrinaut?.finishedAt).toBe(now);
  });

  test("settles a streaming text part", () => {
    const messages: PetrinautAiMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", state: "streaming", text: "Half a sentence" }],
      },
    ];

    const result = finalizeStreamingMessageParts(messages);
    const textPart = result[0]!.parts[0]!;

    expect(textPart.type).toBe("text");
    if (textPart.type !== "text") {
      throw new Error("expected text part");
    }
    expect(textPart.state).toBe("done");
  });

  test("returns the original array when nothing is streaming", () => {
    const messages: PetrinautAiMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          { type: "reasoning", state: "done", text: "Done thinking." },
          { type: "text", state: "done", text: "All done." },
        ],
      },
    ];

    expect(finalizeStreamingMessageParts(messages)).toBe(messages);
  });

  test("returns the original array for an empty transcript", () => {
    const messages: PetrinautAiMessage[] = [];
    expect(finalizeStreamingMessageParts(messages)).toBe(messages);
  });

  test("only finalizes the last message", () => {
    const messages: PetrinautAiMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", state: "streaming", text: "Older streaming" }],
      },
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "A new question" }],
      },
    ];

    const result = finalizeStreamingMessageParts(messages);

    expect(result).toBe(messages);
    const olderPart = result[0]!.parts[0]!;
    if (olderPart.type !== "text") {
      throw new Error("expected text part");
    }
    expect(olderPart.state).toBe("streaming");
  });
});
