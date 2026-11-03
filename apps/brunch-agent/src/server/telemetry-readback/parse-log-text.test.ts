import { expect, test } from "vitest";

import { parseBrunchLog } from "./parse-log-text.ts";

import type { LoggedSubmissionChronology } from "./shared/records.ts";

test("chronology entries are read from coloured server-log lines and keyed by submission, counting the lines that don't parse", () => {
  const entry = { submissionId: "sub-1", outcome: "completed", turns: [] };
  const log = [
    "\u001B[32minfo\u001B[39m: [brunch] listening",
    `\u001B[32minfo\u001B[39m: [brunch] flue.submission chronology ${JSON.stringify(entry)}`,
    "\u001B[32minfo\u001B[39m: [brunch] flue.submission chronology {truncated",
  ].join("\n");

  const { chronologies, skipped } = parseBrunchLog(log);

  expect([...chronologies.keys()]).toEqual(["sub-1"]);
  expect(chronologies.get("sub-1")).toEqual(entry);
  expect(skipped.chronologyLines).toBe(1);
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

  const { chronologies } = parseBrunchLog(
    `[brunch] flue.submission chronology ${JSON.stringify(entry)}`,
  );

  expect(chronologies.get("sub-old")).toEqual(entry);
});

test("idle timeouts are read from production lines with the logger's timestamp", () => {
  const fields = {
    stage: "provider.timeout",
    submissionId: "sub-1",
    turnId: "turn-1",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    phase: "request_dispatch",
    idleMs: 60_000,
    lastEventType: null,
    acknowledged: true,
    retryClaimed: true,
    timestamp: "2026-11-03T10:00:00.000Z",
  };

  const { idleTimeouts, skipped } = parseBrunchLog(
    [
      `warn: [brunch] provider.timeout ${JSON.stringify(fields)}`,
      "warn: [brunch] provider.timeout not json",
    ].join("\n"),
  );

  expect(idleTimeouts).toEqual([
    {
      timestamp: "2026-11-03T10:00:00.000Z",
      submissionId: "sub-1",
      turnId: "turn-1",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      phase: "request_dispatch",
      idleMs: 60_000,
      lastEventType: null,
      acknowledged: true,
      retryClaimed: true,
    },
  ]);
  expect(skipped.idleTimeoutLines).toBe(1);
});
