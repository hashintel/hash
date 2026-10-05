import { describe, expect, test } from "vitest";

import { REVIEW_CHIPS, STARTER_CHIPS } from "./prompt-chips";
import { selectPromptChips } from "./select-prompt-chips";

describe("selectPromptChips", () => {
  test("offers domain starter chips on an empty net before the conversation starts", () => {
    expect(
      selectPromptChips({ hasConversation: false, isNetEmpty: true }),
    ).toBe(STARTER_CHIPS);
  });

  test("hides the chips once the conversation has begun", () => {
    expect(
      selectPromptChips({ hasConversation: true, isNetEmpty: true }),
    ).toEqual([]);
  });

  test("reviews a non-empty net", () => {
    expect(
      selectPromptChips({ hasConversation: false, isNetEmpty: false }),
    ).toBe(REVIEW_CHIPS);
  });
});
