import { describe, expect, test } from "vitest";

import { getTranscriptEntries } from "./transcript-entries";

describe("getTranscriptEntries", () => {
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
