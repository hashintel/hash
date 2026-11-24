import { expect, test } from "vitest";

import { isControlOnly, isFillerOnly } from "./spoken-phrases";

test.each([
  "Um.",
  "Ummm, uh…",
  "Hmm",
  "Mm-hmm.",
  "Uh-huh",
  "Erm",
  "Thanks!",
  "Thank you.",
  "Um, thanks.",
  "Cheers",
])("%j is filler only", (text) => {
  expect(isFillerOnly(text)).toBe(true);
});

test.each([
  "",
  " . ",
  "You",
  "Okay.",
  "Yes",
  "Right.",
  "No",
  "Um, four days.",
  "Thanks, and the queue is seven deep.",
  "Hmm, wait.",
])("%j is not filler only", (text) => {
  expect(isFillerOnly(text)).toBe(false);
});

test.each([
  "Wait.",
  "Wait, wait.",
  "Hold on.",
  "Hang on a second.",
  "Um, hold on.",
  "Stop.",
  "Stop talking, please.",
  "Pause",
  "One moment.",
  "Just a sec.",
  "Give me a minute.",
  "Wait a second please",
])("%j only asks Live to wait or stop", (text) => {
  expect(isControlOnly(text)).toBe(true);
});

test.each([
  "",
  "Um.",
  "Wait, it's seven reviewers.",
  "Stop the second shift at noon.",
  "Hold on to the first draft.",
  "Please",
  "A second reviewer approves.",
])("%j is not only a request to wait or stop", (text) => {
  expect(isControlOnly(text)).toBe(false);
});
