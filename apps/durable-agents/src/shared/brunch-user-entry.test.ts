import { expect, test } from "vitest";

import { type BrunchUserData, userWords } from "./brunch-user-entry";

import type { EntryRecord } from "@earendil-works/pi-durable";

const entry = (
  kind: string,
  data?: BrunchUserData | null | string[],
  said?: string,
): Pick<EntryRecord, "kind" | "data" | "model"> => ({
  kind,
  ...(data === undefined ? {} : { data }),
  ...(said === undefined
    ? {}
    : {
        model: [
          {
            role: "user",
            content: [
              { type: "text", text: said },
              { type: "text", text: "Today." },
            ],
            timestamp: 0,
          },
        ],
      }),
});

test.each([
  [
    "an ordinary brunch.user entry",
    entry("brunch.user", { body: "ordinary", userText: "Add a dryer." }),
    "Add a dryer.",
  ],
  [
    "a contextual brunch.user entry, without its context",
    entry(
      "brunch.user",
      {
        body: "contextual",
        userText: "Add a dryer.",
        diagnosticsContext: "Net check: 2 warnings.",
        submissionContext: { interviewBudget: { questions: 3 } },
      },
      "<context>Net check: 2 warnings.</context> Add a dryer.",
    ),
    "Add a dryer.",
  ],
  [
    "a brunch.user entry whose envelope did not parse, by its message",
    entry("brunch.user", { body: "invalid-contextual" }, "<context"),
    "<context Today.",
  ],
  ["a brunch.user entry without data or message", entry("brunch.user"), ""],
  ["a brunch.user entry with null data", entry("brunch.user", null), ""],
  [
    "a brunch.user entry whose data is a list",
    entry("brunch.user", ["Add a dryer."]),
    "",
  ],
  [
    "an older pi.user entry, by its message",
    entry("pi.user", undefined, "Add a dryer."),
    "Add a dryer. Today.",
  ],
  [
    "another kind's userText",
    entry("pi.user", { body: "ordinary", userText: "Add a dryer." }),
    "",
  ],
  ["no entry", undefined, ""],
])("the words of %s", (_, read, words) => {
  expect(userWords(read)).toBe(words);
});
