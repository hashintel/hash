import { describe, expect, test } from "vitest";

import { BRUNCH_QUESTION_TOOL_NAME } from "../src/question-marker";

describe("legacy Brunch question-marker hydration", () => {
  test("retains the persisted tool identity needed to hide old rows", () => {
    expect(BRUNCH_QUESTION_TOOL_NAME).toBe("brunch_mark_question");
  });
});
