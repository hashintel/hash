import { expect, test } from "vitest";

import { repeatsLiveOutput } from "./repeats-live-output";

const liveOutputText =
  "How many staff work the morning shift on weekdays? Okay.";

test.each([
  ["Okay.", true],
  ["morning, SHIFT!", true],
  ["the morning shift on", true],
  ["shift morning", false],
  ["staff weekdays", false],
  ["Seven.", false],
  [" ?! ", false],
])(
  "a short transcript %j repeats Live only word for word: %s",
  (text, repeats) => {
    expect(repeatsLiveOutput(text, liveOutputText)).toBe(repeats);
  },
);

test.each([
  ["How many staff work the morning shift", true],
  ["how many staff work the morning shift on weekdays okay", true],
  ["the morning shift staff work how many weekdays", false],
  ["Seven reviewers work the evening shift on weekends", false],
])(
  "six or more words %j repeat Live when they mostly match in order: %s",
  (text, repeats) => {
    expect(repeatsLiveOutput(text, liveOutputText)).toBe(repeats);
  },
);

test("nothing repeats Live when none of its words were captured", () => {
  expect(repeatsLiveOutput("Okay.", "")).toBe(false);
  expect(repeatsLiveOutput("How many staff work the morning shift", "")).toBe(
    false,
  );
});
