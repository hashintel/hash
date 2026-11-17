import { expect, test } from "vitest";

import { type BrunchUserData, brunchUserWords } from "./brunch-user-entry";

const entry = (kind: string, data?: BrunchUserData | null | string[]) => ({
  kind,
  ...(data === undefined ? {} : { data }),
});

test.each([
  [
    "an ordinary brunch.user entry",
    entry("brunch.user", { body: "ordinary", userText: "Add a dryer." }),
    "Add a dryer.",
  ],
  [
    "a contextual brunch.user entry, without its context",
    entry("brunch.user", {
      body: "contextual",
      userText: "Add a dryer.",
      diagnosticsContext: "Net check: 2 warnings.",
      submissionContext: { interviewBudget: { questions: 3 } },
    }),
    "Add a dryer.",
  ],
  [
    "a brunch.user entry whose envelope did not parse",
    entry("brunch.user", { body: "invalid-contextual" }),
    undefined,
  ],
  ["a brunch.user entry without data", entry("brunch.user"), undefined],
  ["a brunch.user entry with null data", entry("brunch.user", null), undefined],
  [
    "a brunch.user entry whose data is a list",
    entry("brunch.user", ["Add a dryer."]),
    undefined,
  ],
  [
    "another kind's userText",
    entry("pi.user", { body: "ordinary", userText: "Add a dryer." }),
    undefined,
  ],
  ["no entry", undefined, undefined],
])("the words of %s", (_, read, words) => {
  expect(brunchUserWords(read)).toBe(words);
});
