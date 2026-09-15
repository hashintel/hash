import { describe, expect, test } from "vitest";

import {
  hashCanonicalSpeechText,
  selectCanonicalSpeech,
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

  test("does not treat structured tool input as canonical speech", () => {
    const messages = [
      {
        id: "assistant-ask",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolCallId: "ask-1",
            toolName: "brunch_ask",
            state: "input-available",
            input: { question: "Which operator confirms the batch?" },
          },
          {
            type: "dynamic-tool",
            toolCallId: "ask-malformed",
            toolName: "brunch_ask",
            state: "input-available",
            input: { question: 42 },
          },
          {
            type: "dynamic-tool",
            toolCallId: "ask-submitted",
            toolName: "brunch_ask",
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

    expect(select(messages)).toEqual([]);
  });

  test("derives the question segment from the whole finalized assistant turn", () => {
    const text = "The batch is ready.\n\nWhich operator confirms the batch?";
    const selection = selectCanonicalSpeech([
      {
        id: "assistant-question",
        role: "assistant",
        parts: [
          {
            type: "text",
            text,
            state: "done",
          },
        ],
      },
    ]);

    expect(selection.segments.map((segment) => segment.text)).toEqual([text]);
    expect(selection.questionSegment).toEqual({
      contentHash: hashCanonicalSpeechText(text),
      id: `canonical-speech:assistant-question:question%3Afinalized-turn:${hashCanonicalSpeechText(text)}`,
      messageId: "assistant-question",
      partId: "question:finalized-turn",
      source: "assistant-question",
      text,
    });
  });

  test("waits through client-tool continuation and combines every text part", () => {
    const unfinished = {
      id: "assistant-continuation",
      role: "assistant" as const,
      parts: [
        {
          type: "text" as const,
          text: "I recorded the batch.",
          state: "done" as const,
        },
        { type: "step-start" as const },
        {
          type: "dynamic-tool" as const,
          toolCallId: "read-1",
          toolName: "read_petrinaut_net",
          state: "output-available" as const,
          input: {},
          output: {},
        },
      ],
    } satisfies PetrinautAiMessage;

    expect(selectCanonicalSpeech([unfinished]).questionSegment).toBeUndefined();

    const completed = {
      ...unfinished,
      parts: [
        ...unfinished.parts,
        { type: "step-start" as const },
        {
          type: "text" as const,
          text: "Which operator confirms it?",
          state: "done" as const,
        },
      ],
    } satisfies PetrinautAiMessage;
    expect(selectCanonicalSpeech([completed]).questionSegment?.text).toBe(
      "I recorded the batch.\n\nWhich operator confirms it?",
    );
  });

  test("keeps legacy marker parts inert", () => {
    const text = "The finalized response is authoritative.";
    const selection = selectCanonicalSpeech([
      {
        id: "assistant-legacy-marker",
        role: "assistant",
        parts: [
          {
            type: "data-brunch-question",
            data: {
              question: "Legacy narrow question?",
              toolCallId: "legacy-question-1",
            },
          },
          { type: "text", text, state: "done" },
        ],
      },
    ]);

    expect(selection.questionSegment?.text).toBe(text);
    expect(selection.questionSegment?.id).not.toContain("legacy-question-1");
  });

  test.each([
    {
      name: "streaming",
      message: {
        id: "assistant-streaming",
        role: "assistant" as const,
        parts: [
          {
            type: "text" as const,
            text: "Still provisional.",
            state: "streaming" as const,
          },
        ],
      },
    },
    {
      name: "empty",
      message: {
        id: "assistant-empty",
        role: "assistant" as const,
        parts: [{ type: "text" as const, text: " ", state: "done" as const }],
      },
    },
    {
      name: "tool-only",
      message: {
        id: "assistant-tool-only",
        role: "assistant" as const,
        parts: [
          {
            type: "dynamic-tool" as const,
            toolCallId: "tool-only-1",
            toolName: "ping",
            state: "output-available" as const,
            input: {},
            output: { ok: true },
          },
        ],
      },
    },
    {
      name: "stopped",
      message: {
        id: "assistant-stopped",
        role: "assistant" as const,
        metadata: { stopped: true as const },
        parts: [
          {
            type: "text" as const,
            text: "Do not derive stopped prose.",
            state: "done" as const,
          },
        ],
      },
    },
  ])("does not derive a new segment from a $name reply", ({ message }) => {
    expect(
      selectCanonicalSpeech([message satisfies PetrinautAiMessage])
        .questionSegment,
    ).toBeUndefined();
  });

  test("keeps finalized-turn identity stable across hydration", () => {
    const live = selectCanonicalSpeech([
      {
        id: "assistant-stable",
        role: "assistant",
        parts: [
          { type: "text", text: "First paragraph.", state: "done" },
          { type: "step-start" },
          {
            type: "dynamic-tool",
            toolCallId: "tool-1",
            toolName: "ping",
            state: "output-available",
            input: {},
            output: { ok: true },
          },
          { type: "step-start" },
          { type: "text", text: "Final question?", state: "done" },
        ],
      },
    ]);
    const hydrated = selectCanonicalSpeech([
      {
        id: "assistant-stable",
        role: "assistant",
        parts: [
          { type: "text", text: "First paragraph.", state: "done" },
          { type: "step-start" },
          {
            type: "dynamic-tool",
            toolCallId: "tool-1",
            toolName: "ping",
            state: "output-available",
            input: {},
            output: { ok: true },
          },
          { type: "step-start" },
          { type: "text", text: "Final question?", state: "done" },
        ],
      },
    ]);

    expect(hydrated.questionSegment).toEqual(live.questionSegment);
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
