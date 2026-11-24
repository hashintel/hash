import { describe, expect, test } from "vitest";

import { REVIEW_CHIPS } from "./prompt-chips";
import { selectPromptChips } from "./select-prompt-chips";

const starterChips = [
  { id: "example", label: "Example", prompt: "Build an example" },
];

describe("selectPromptChips", () => {
  test("offers no starters by default on an empty net", () => {
    expect(
      selectPromptChips({ hasConversation: false, isNetEmpty: true }),
    ).toEqual([]);
  });

  test("offers only the host's starters before a conversation", () => {
    expect(
      selectPromptChips({
        hasConversation: false,
        isNetEmpty: true,
        starterChips,
      }),
    ).toBe(starterChips);
  });

  test("hides configured starters once the conversation has begun", () => {
    expect(
      selectPromptChips({
        hasConversation: true,
        isNetEmpty: true,
        starterChips,
      }),
    ).toEqual([]);
  });

  test.each([false, true])(
    "reviews a non-empty net with conversation=%s",
    (hasConversation) => {
      expect(
        selectPromptChips({ hasConversation, isNetEmpty: false, starterChips }),
      ).toBe(REVIEW_CHIPS);
    },
  );
});
