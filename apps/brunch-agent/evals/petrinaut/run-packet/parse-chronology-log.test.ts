import { expect, test } from "vitest";

import { parseChronologyLog } from "./parse-chronology-log.ts";

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
