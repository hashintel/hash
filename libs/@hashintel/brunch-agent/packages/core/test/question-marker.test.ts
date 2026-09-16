import * as v from "valibot";
import { describe, expect, test } from "vitest";

import {
  BRUNCH_QUESTION_DATA_NAME,
  BRUNCH_QUESTION_TOOL_NAME,
  BRUNCH_QUESTION_TOOL_NAMES,
  BrunchQuestionDataSchema,
  BrunchQuestionInputSchema,
  LEGACY_BRUNCH_QUESTION_TOOL_NAME,
  LEGACY_QUESTION_REPLAY_TOOL_NAME,
  parseBrunchQuestionData,
} from "../src/question-marker";

describe("legacy Brunch question markers", () => {
  test("preserves historical tool and data identities for projection compatibility", () => {
    expect(BRUNCH_QUESTION_TOOL_NAME).toBe("brunch_mark_question");
    expect(LEGACY_BRUNCH_QUESTION_TOOL_NAME).toBe("brunch_mark_question");
    expect(LEGACY_QUESTION_REPLAY_TOOL_NAME).toBe("mark_question_for_replay");
    expect(BRUNCH_QUESTION_TOOL_NAMES).toEqual([
      "brunch_mark_question",
      "mark_question_for_replay",
    ]);
    expect(BRUNCH_QUESTION_DATA_NAME).toBe("brunch-question");
  });

  test("preserves exact non-blank question text and tool-call identity", () => {
    const question = "  Which line should run this order?  ";

    expect(
      v.parse(BrunchQuestionInputSchema, {
        question,
      }),
    ).toEqual({ question });
    expect(
      v.parse(BrunchQuestionDataSchema, {
        question,
        toolCallId: "tool-question-1",
      }),
    ).toEqual({ question, toolCallId: "tool-question-1" });
  });

  test.each([
    { question: "" },
    { question: "   " },
    { question: "What matters?", toolCallId: "" },
    { question: "What matters?", toolCallId: "   " },
  ])("rejects an incomplete marker: %j", (marker) => {
    expect(v.safeParse(BrunchQuestionDataSchema, marker).success).toBe(false);
    expect(parseBrunchQuestionData(marker)).toBeUndefined();
  });

  test("parses exact question data at the client projection boundary", () => {
    const marker = {
      question: "  Which line should run this order?  ",
      toolCallId: "tool-question-1",
    };

    expect(parseBrunchQuestionData(marker)).toEqual(marker);
    expect(parseBrunchQuestionData(null)).toBeUndefined();
  });
});
