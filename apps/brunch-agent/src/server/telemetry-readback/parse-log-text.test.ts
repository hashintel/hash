import { expect, test } from "vitest";

import { parseBrunchLog } from "./parse-log-text.ts";

import type { ModelCallScope } from "../model-call-scope.ts";
import type { ModelStreamIdleTimeout } from "../provider-admission.ts";
import type { LoggedSubmissionChronology } from "./shared/records.ts";

test("chronology entries are read from coloured server-log lines and keyed by submission, counting the lines that don't parse", () => {
  const entry = { submissionId: "sub-1", outcome: "completed", turns: [] };
  const log = [
    "\u001B[32minfo\u001B[39m: [brunch] listening",
    `\u001B[32minfo\u001B[39m: [brunch] flue.submission chronology ${JSON.stringify(entry)}`,
    "\u001B[32minfo\u001B[39m: [brunch] flue.submission chronology {truncated",
    `\u001B[32minfo\u001B[39m: [brunch] flue.submission chronology ${JSON.stringify({ ...entry, submissionId: "sub-2", turns: [null] })}`,
  ].join("\n");

  const { chronologies, skipped } = parseBrunchLog(log);

  expect([...chronologies.keys()]).toEqual(["sub-1"]);
  expect(chronologies.get("sub-1")).toEqual(entry);
  expect(skipped.chronologyLines).toBe(2);
});

test("a turn logged before turns named their provider, start time, retry or error reads with those fields null", () => {
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
  };

  const { chronologies } = parseBrunchLog(
    `[brunch] flue.submission chronology ${JSON.stringify(entry)}`,
  );

  expect(chronologies.get("sub-old")).toEqual({
    submissionId: "sub-old",
    outcome: "completed",
    turns: [
      {
        turnId: "t1",
        purpose: "agent",
        provider: null,
        requestedModel: null,
        responseModel: null,
        startedAt: null,
        retryOf: null,
        timeToFirstEventMs: 100,
        durationMs: 200,
        terminal: "turn",
        isError: false,
        error: null,
        inputTokens: 1,
        outputTokens: 1,
        toolCalls: [],
      },
    ],
  } satisfies LoggedSubmissionChronology);
});

test("only the turn fields readback reads survive, so error messages and unknown fields in a log are dropped", () => {
  const turn = {
    turnId: "t1",
    purpose: "agent",
    durationMs: 200,
    terminal: "turn",
    error: {
      type: "provider_error",
      code: "overloaded",
      message: "upstream said: <prompt text>",
      stack: "Error: at …",
    },
    prompt: "user text",
    toolCalls: [
      {
        toolCallId: "call-1",
        toolName: "addPlace",
        firstDeltaMs: 10,
        lastDeltaMs: 20,
        argumentChars: 30,
        arguments: "{…}",
      },
    ],
  };

  const { chronologies } = parseBrunchLog(
    `[brunch] flue.submission chronology ${JSON.stringify({ submissionId: "sub-1", outcome: "failed", turns: [turn] })}`,
  );
  const [read] = chronologies.get("sub-1")?.turns ?? [];

  expect(read?.error).toEqual({ type: "provider_error", code: "overloaded" });
  expect(read?.toolCalls).toEqual([
    {
      toolCallId: "call-1",
      firstDeltaMs: 10,
      lastDeltaMs: 20,
      argumentChars: 30,
    },
  ]);
  expect(JSON.stringify(read)).not.toMatch(
    /prompt text|user text|stack|arguments/,
  );
});

test("a chronology line with a turn missing a field readback relies on is skipped, not half-read", () => {
  const turn = {
    turnId: "t1",
    purpose: "agent",
    terminal: "turn",
    toolCalls: [],
  };

  const { chronologies, skipped } = parseBrunchLog(
    `[brunch] flue.submission chronology ${JSON.stringify({ submissionId: "sub-1", outcome: "completed", turns: [turn] })}`,
  );

  expect(chronologies.size).toBe(0);
  expect(skipped.chronologyLines).toBe(1);
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
    lastEventType: undefined,
    acknowledged: true,
    retryClaimed: true,
    timestamp: "2026-11-03T10:00:00.000Z",
  } satisfies ModelStreamIdleTimeout &
    ModelCallScope & { stage: string; timestamp: string };

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
