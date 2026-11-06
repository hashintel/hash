import { expect, test } from "vitest";

import {
  parseChronologyLog,
  type LoggedSubmissionChronology,
} from "./parse-chronology-log.ts";

test("chronology entries are read from coloured server-log lines and keyed by submission, counting the lines that don't parse", () => {
  const entry = { submissionId: "sub-1", outcome: "completed", turns: [] };
  const log = [
    "\u001B[32minfo\u001B[39m: [brunch] listening",
    `\u001B[32minfo\u001B[39m: [brunch] flue.submission chronology ${JSON.stringify(entry)}`,
    "\u001B[32minfo\u001B[39m: [brunch] flue.submission chronology {truncated",
  ].join("\n");

  const { entries, skippedLines } = parseChronologyLog(log);

  expect([...entries.keys()]).toEqual(["sub-1"]);
  expect(entries.get("sub-1")).toEqual(entry);
  expect(skippedLines).toBe(1);
});

test("a turn logged before turns named their provider, start time, retry or error still reads as a logged turn", () => {
  const entry = {
    submissionId: "sub-old",
    outcome: "completed",
    turns: [
      {
        turnId: "t1",
        purpose: "agent",
        timeToFirstEventMs: 100,
        durationMs: 200,
        terminal: "turn",
        isError: false,
        inputTokens: 1,
        cacheReadTokens: 0,
        outputTokens: 1,
        requestShape: null,
        responseShape: null,
        toolCalls: [],
      },
    ],
  } satisfies LoggedSubmissionChronology;

  const { entries } = parseChronologyLog(
    `[brunch] flue.submission chronology ${JSON.stringify(entry)}`,
  );

  expect(entries.get("sub-old")).toEqual(entry);
});
