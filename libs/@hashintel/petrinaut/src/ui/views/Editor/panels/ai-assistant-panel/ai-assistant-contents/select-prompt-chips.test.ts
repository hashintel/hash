import { describe, expect, test } from "vitest";

import {
  REVIEW_CHIPS,
  STARTER_CHIPS,
  START_POSTURE_CHIPS,
} from "./prompt-chips";
import { selectPromptChips } from "./select-prompt-chips";

describe("selectPromptChips", () => {
  test("offers careful elicitation or a quick preview after Build with Brunch", () => {
    expect(
      selectPromptChips({
        hasConversation: false,
        isNetEmpty: true,
        offerStartPosture: true,
      }),
    ).toBe(START_POSTURE_CHIPS);
  });

  test("keeps domain starter chips on an ordinary empty-net open", () => {
    expect(
      selectPromptChips({
        hasConversation: false,
        isNetEmpty: true,
        offerStartPosture: false,
      }),
    ).toBe(STARTER_CHIPS);
  });

  test("hides start-posture chips once the conversation has begun", () => {
    expect(
      selectPromptChips({
        hasConversation: true,
        isNetEmpty: true,
        offerStartPosture: true,
      }),
    ).toEqual([]);
  });

  test("reviews a non-empty net even after Build with Brunch", () => {
    expect(
      selectPromptChips({
        hasConversation: false,
        isNetEmpty: false,
        offerStartPosture: true,
      }),
    ).toBe(REVIEW_CHIPS);
  });

  test("start-posture prompts stay in ordinary language", () => {
    for (const chip of START_POSTURE_CHIPS) {
      expect(chip.prompt).not.toMatch(
        /brunch_why|mutate_petrinet|getLatestNetDefinition|toolu_/,
      );
    }
  });
});
