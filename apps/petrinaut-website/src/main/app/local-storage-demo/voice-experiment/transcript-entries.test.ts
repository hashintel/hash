import { describe, expect, test } from "vitest";

import { getTranscriptEntries } from "./transcript-entries";

describe("getTranscriptEntries", () => {
  test("reconciles a late expert final around an interviewer partial", () => {
    expect(
      getTranscriptEntries([
        {
          sequence: 1,
          event: {
            speaker: "expert",
            timestampMs: 1,
            transcript: "Single",
            turnId: 1,
            type: "partial-transcript",
          },
        },
        {
          sequence: 2,
          event: {
            speaker: "assistant",
            timestampMs: 2,
            transcript: "Okay, thanks for that detail—let’s",
            turnId: 1,
            type: "partial-transcript",
          },
        },
        {
          sequence: 3,
          event: {
            speaker: "expert",
            timestampMs: 3,
            transcript: "Single battery",
            turnId: 1,
            type: "final-transcript",
          },
        },
        {
          sequence: 4,
          event: {
            speaker: "assistant",
            timestampMs: 4,
            transcript:
              "What’s the starting condition for that battery when the process begins?",
            turnId: 1,
            type: "final-transcript",
          },
        },
      ]),
    ).toEqual([
      {
        id: 1,
        isPartial: false,
        speaker: "expert",
        transcript: "Single battery",
        turnId: 1,
      },
      {
        id: 2,
        isPartial: false,
        speaker: "assistant",
        transcript:
          "What’s the starting condition for that battery when the process begins?",
        turnId: 1,
      },
    ]);
  });

  test("collapses consecutive expert revisions into one bubble", () => {
    expect(
      getTranscriptEntries([
        {
          sequence: 1,
          event: {
            speaker: "expert",
            timestampMs: 1,
            transcript: "Test elicitation.",
            turnId: 1,
            type: "final-transcript",
          },
        },
        {
          sequence: 2,
          event: {
            speaker: "expert",
            timestampMs: 2,
            transcript: "Test, elicitation, one, two, three.",
            turnId: 2,
            type: "final-transcript",
          },
        },
        {
          sequence: 3,
          event: {
            speaker: "assistant",
            timestampMs: 3,
            transcript: "What process are we modelling?",
            turnId: 2,
            type: "final-transcript",
          },
        },
      ]),
    ).toEqual([
      {
        id: 1,
        isPartial: false,
        speaker: "expert",
        transcript: "Test, elicitation, one, two, three.",
        turnId: 2,
      },
      {
        id: 3,
        isPartial: false,
        speaker: "assistant",
        transcript: "What process are we modelling?",
        turnId: 2,
      },
    ]);
  });
});
