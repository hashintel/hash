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

test.each([
  ["I'll check it for you", true],
  ["We check it for you", false],
])(
  "the six-word boundary counts tokens, so a contraction counts twice: %j repeats Live: %s",
  (text, repeats) => {
    expect(
      repeatsLiveOutput(
        text,
        "I'll check it out for you. We check it out for you.",
      ),
    ).toBe(repeats);
  },
);

test("nothing repeats Live when none of its words were captured", () => {
  expect(repeatsLiveOutput("Okay.", "")).toBe(false);
  expect(repeatsLiveOutput("How many staff work the morning shift", "")).toBe(
    false,
  );
});

test("Live's words repeat as echo even when they also resemble the transcription prompt", () => {
  const vocabulary =
    "place, transition, arc, token, marking, guard, rate, distribution";
  expect(repeatsLiveOutput(vocabulary, `Let's cover ${vocabulary}.`)).toBe(
    true,
  );
});
