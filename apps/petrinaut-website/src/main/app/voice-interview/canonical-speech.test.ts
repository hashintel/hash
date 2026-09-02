import { describe, expect, test } from "vitest";

import { ASK_TOOL_NAME } from "@hashintel/brunch-agent/client-tools";

import {
  hashCanonicalSpeechText,
  selectCanonicalSpeechSegments,
} from "./canonical-speech";

import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

const select = (messages: PetrinautAiMessage[]) =>
  selectCanonicalSpeechSegments(messages);

describe("canonical speech selection", () => {
  test("selects only finalized assistant text without changing it", () => {
    const messages = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Do not speak the user." }],
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            text: "Do not speak reasoning.",
            state: "done",
          },
          {
            type: "text",
            text: "Do not speak partial text.",
            state: "streaming",
          },
          {
            type: "text",
            text: "   ",
            state: "done",
          },
          {
            type: "text",
            text: "  Keep this exact finalized response.  ",
            state: "done",
          },
          {
            type: "text",
            text: "Loaded finalized response.",
          },
          {
            type: "dynamic-tool",
            toolCallId: "diagnostic-1",
            toolName: "diagnostic",
            state: "output-available",
            input: {},
            output: { text: "Do not speak tool output." },
          },
        ],
      },
      {
        id: "system-1",
        role: "system",
        parts: [{ type: "text", text: "Do not speak system text." }],
      },
    ] satisfies PetrinautAiMessage[];

    const selected = select(messages);
    const firstHash = hashCanonicalSpeechText(
      "  Keep this exact finalized response.  ",
    );
    const secondHash = hashCanonicalSpeechText("Loaded finalized response.");
    expect(selected).toEqual([
      {
        contentHash: firstHash,
        id: `canonical-speech:assistant-1:text%3A3:${firstHash}`,
        messageId: "assistant-1",
        partId: "text:3",
        source: "assistant-text",
        text: "  Keep this exact finalized response.  ",
      },
      {
        contentHash: secondHash,
        id: `canonical-speech:assistant-1:text%3A4:${secondHash}`,
        messageId: "assistant-1",
        partId: "text:4",
        source: "assistant-text",
        text: "Loaded finalized response.",
      },
    ]);
  });

  test("selects one exact validated brunch_ask question", () => {
    const messages = [
      {
        id: "assistant-ask",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolCallId: "ask-1",
            toolName: ASK_TOOL_NAME,
            state: "input-available",
            input: { question: "Which operator confirms the batch?" },
          },
          {
            type: "dynamic-tool",
            toolCallId: "ask-malformed",
            toolName: ASK_TOOL_NAME,
            state: "input-available",
            input: { question: 42 },
          },
          {
            type: "dynamic-tool",
            toolCallId: "ask-submitted",
            toolName: ASK_TOOL_NAME,
            state: "output-available",
            input: { question: "Do not repeat an answered question." },
            output: { answer: "Already answered." },
          },
          {
            type: "dynamic-tool",
            toolCallId: "other-tool",
            toolName: "other_tool",
            state: "input-available",
            input: { question: "Do not speak another tool." },
          },
        ],
      },
    ] satisfies PetrinautAiMessage[];

    const selected = select(messages);
    const contentHash = hashCanonicalSpeechText(
      "Which operator confirms the batch?",
    );
    expect(selected).toEqual([
      {
        contentHash,
        id: `canonical-speech:assistant-ask:ask-1:${contentHash}`,
        messageId: "assistant-ask",
        partId: "ask-1",
        source: "brunch-ask",
        text: "Which operator confirms the batch?",
      },
    ]);
  });

  test("uses stable source identity plus an exact-text fingerprint", () => {
    expect(hashCanonicalSpeechText("hello")).toBe("fnv1a32:4f9f2cab");

    const first = select([
      {
        id: "assistant/id",
        role: "assistant",
        parts: [{ type: "text", text: "Exact text", state: "done" }],
      },
    ]);
    const repeated = select([
      {
        id: "assistant/id",
        role: "assistant",
        parts: [{ type: "text", text: "Exact text", state: "done" }],
      },
    ]);
    const changed = select([
      {
        id: "assistant/id",
        role: "assistant",
        parts: [{ type: "text", text: "Exact text ", state: "done" }],
      },
    ]);

    expect(repeated).toEqual(first);
    expect(changed[0]?.partId).toBe(first[0]?.partId);
    expect(changed[0]?.contentHash).not.toBe(first[0]?.contentHash);
    expect(changed[0]?.id).not.toBe(first[0]?.id);
  });
});
