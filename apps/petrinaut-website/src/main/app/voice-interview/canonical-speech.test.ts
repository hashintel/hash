import { describe, expect, test } from "vitest";

import {
  hashCanonicalSpeechText,
  selectAuthoredVoiceSpeech,
  selectCanonicalSpeech,
  selectCanonicalSpeechSegments,
} from "./canonical-speech";

import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

const select = (messages: PetrinautAiMessage[]) =>
  selectCanonicalSpeechSegments(messages);

const speechParts = (
  speech = "  The limit remains unknown.  ",
  toolCallId = "speech-1",
): PetrinautAiMessage["parts"] => [
  {
    type: "dynamic-tool",
    toolName: "brunch_set_voice_response",
    toolCallId,
    state: "output-available",
    input: { speech },
    output: { title: "Authored speech", detail: speech },
  },
  { type: "data-brunch-voice-response", data: { speech, toolCallId } },
];
const fullReport = {
  type: "text",
  text: "# Full report\n\nThe limit remains unknown. Further validation is required.",
  state: "done",
} as const;

describe("Brunch-authored speech selection", () => {
  test("keeps exact speech separate from displayed prose, with stable response identity on reload", () => {
    const messages: PetrinautAiMessage[] = [
      {
        id: "reply-1",
        role: "assistant",
        parts: [...speechParts(), fullReport],
      },
      {
        id: "reply-2",
        role: "assistant",
        parts: [...speechParts(), fullReport],
      },
    ];
    const selected = selectAuthoredVoiceSpeech(messages);
    expect(selected.map(({ text }) => text)).toEqual([
      "  The limit remains unknown.  ",
      "  The limit remains unknown.  ",
    ]);
    expect(selected[0]?.id).not.toBe(selected[1]?.id);
    expect(selectAuthoredVoiceSpeech(structuredClone(messages))).toEqual(
      selected,
    );
    expect(select(messages).map(({ text }) => text)).toEqual([
      fullReport.text,
      fullReport.text,
    ]);
  });

  test.each([
    { name: "missing speech", parts: [fullReport] },
    { name: "blank speech", parts: [...speechParts("  "), fullReport] },
    { name: "missing report", parts: speechParts() },
    { name: "only preceding prose", parts: [fullReport, ...speechParts()] },
    {
      name: "unfinished report",
      parts: [...speechParts(), { ...fullReport, state: "streaming" }],
    },
    {
      name: "unmatched tool identity",
      parts: [
        ...speechParts(),
        {
          type: "data-brunch-voice-response",
          data: { speech: "Wrong identity", toolCallId: "other" },
        },
        fullReport,
      ],
    },
    {
      name: "later substantive tool",
      parts: [
        ...speechParts(),
        {
          type: "dynamic-tool",
          toolName: "updateModel",
          toolCallId: "update-1",
          state: "output-available",
          input: {},
          output: {},
        },
        fullReport,
      ],
    },
  ] satisfies Array<{ name: string; parts: PetrinautAiMessage["parts"] }>)(
    "withholds $name rather than deriving a summary",
    ({ parts }) => {
      expect(
        selectAuthoredVoiceSpeech([{ id: "reply", role: "assistant", parts }]),
      ).toEqual([]);
    },
  );

  test("replaces an obsolete draft after tools and preserves marked question replay", () => {
    const question = "Which limit matters?";
    const messages: PetrinautAiMessage[] = [
      {
        id: "reply",
        role: "assistant",
        parts: [
          ...speechParts("An obsolete claim."),
          {
            type: "dynamic-tool",
            toolName: "readModel",
            toolCallId: "read-1",
            state: "output-available",
            input: {},
            output: {},
          },
          ...speechParts(`The limit is unknown. ${question}`, "speech-2"),
          {
            type: "dynamic-tool",
            toolName: "brunch_mark_question",
            toolCallId: "question-1",
            state: "output-available",
            input: { question },
            output: {},
          },
          {
            type: "data-brunch-question",
            data: { question, toolCallId: "question-1" },
          },
          { ...fullReport, text: `${fullReport.text}\n\n${question}` },
        ],
      },
    ];
    expect(selectAuthoredVoiceSpeech(messages).map(({ text }) => text)).toEqual(
      [`The limit is unknown. ${question}`],
    );
    expect(selectCanonicalSpeech(messages).questionSegment?.text).toBe(
      question,
    );
    expect(
      selectAuthoredVoiceSpeech(
        messages.map((message) => ({
          ...message,
          metadata: { stopped: true },
        })),
      ),
    ).toEqual([]);
  });
});

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

  test("selects an exact marked question separately from full-response text", () => {
    const question = "Which operator confirms the batch?";
    const selection = selectCanonicalSpeech([
      {
        id: "assistant-question",
        role: "assistant",
        parts: [
          {
            type: "data-brunch-question",
            data: { question, toolCallId: "tool-question-1" },
          },
          {
            type: "text",
            text: `The batch is ready. ${question} I can explain the choices.`,
            state: "done",
          },
        ],
      },
    ]);

    expect(selection.segments.map(({ text }) => text)).toEqual([
      `The batch is ready. ${question} I can explain the choices.`,
    ]);
    expect(selection.questionSegment).toEqual({
      contentHash: hashCanonicalSpeechText(question),
      id: `canonical-speech:assistant-question:question%3Atool-question-1:${hashCanonicalSpeechText(question)}`,
      messageId: "assistant-question",
      partId: "question:tool-question-1",
      source: "assistant-question",
      text: question,
    });
  });

  test.each([
    {
      name: "missing exact finalized prose",
      parts: [
        {
          type: "data-brunch-question" as const,
          data: {
            question: "Which operator confirms the batch?",
            toolCallId: "tool-question-1",
          },
        },
        {
          type: "text" as const,
          text: "A different question appears in the response.",
          state: "done" as const,
        },
      ],
    },
    {
      name: "only provisional prose",
      parts: [
        {
          type: "data-brunch-question" as const,
          data: {
            question: "Which operator confirms the batch?",
            toolCallId: "tool-question-1",
          },
        },
        {
          type: "text" as const,
          text: "Which operator confirms the batch?",
          state: "streaming" as const,
        },
      ],
    },
    {
      name: "blank marker identity",
      parts: [
        {
          type: "data-brunch-question" as const,
          data: {
            question: "Which operator confirms the batch?",
            toolCallId: "  ",
          },
        },
        {
          type: "text" as const,
          text: "Which operator confirms the batch?",
          state: "done" as const,
        },
      ],
    },
  ])("rejects a question marker with $name", ({ parts }) => {
    expect(
      selectCanonicalSpeech([
        {
          id: "assistant-invalid-question",
          role: "assistant",
          parts,
        },
      ]).questionSegment,
    ).toBeUndefined();
  });

  test("does not correlate a marker to text from another assistant message", () => {
    const question = "Which operator confirms the batch?";

    expect(
      selectCanonicalSpeech([
        {
          id: "assistant-marker",
          role: "assistant",
          parts: [
            {
              type: "data-brunch-question",
              data: { question, toolCallId: "tool-question-1" },
            },
          ],
        },
        {
          id: "assistant-text",
          role: "assistant",
          parts: [{ type: "text", text: question, state: "done" }],
        },
      ]).questionSegment,
    ).toBeUndefined();
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
