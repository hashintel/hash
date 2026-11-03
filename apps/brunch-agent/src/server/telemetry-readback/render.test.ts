import { expect, test } from "vitest";

import {
  renderSubmissionDetail,
  renderSubmissionList,
  summarizeSubmission,
} from "./render.ts";

import type {
  LoggedIdleTimeout,
  LoggedSubmissionChronology,
  LoggedTurnChronology,
} from "./shared/records.ts";

const turn = (
  turnId: string,
  overrides: Partial<LoggedTurnChronology> = {},
): LoggedTurnChronology => ({
  turnId,
  purpose: "agent",
  provider: "anthropic",
  requestedModel: "claude-sonnet-4-6",
  responseModel: "claude-sonnet-4-6-20260101",
  retryOf: null,
  error: null,
  startedAt: "2026-11-03T10:00:00.000Z",
  timeToFirstEventMs: 800,
  durationMs: 3_000,
  terminal: "turn",
  isError: false,
  inputTokens: 100,
  cacheReadTokens: 0,
  outputTokens: 20,
  requestShape: null,
  responseShape: null,
  toolCalls: [],
  ...overrides,
});

const chronology: LoggedSubmissionChronology = {
  submissionId: "sub-1",
  outcome: "completed",
  timestamp: "2026-11-03T10:00:30.000Z",
  turns: [
    turn("turn-1", {
      timeToFirstEventMs: null,
      isError: true,
      error: {
        type: "model_stream_idle",
        code: "model_stream_idle",
        name: "Error",
      },
    }),
    turn("turn-2", { retryOf: "turn-1", timeToFirstEventMs: 12_000 }),
  ],
};

const idleTimeout: LoggedIdleTimeout = {
  timestamp: "2026-11-03T10:00:20.000Z",
  submissionId: "sub-1",
  turnId: "turn-1",
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  phase: "request_dispatch",
  idleMs: 60_000,
  lastEventType: null,
  acknowledged: true,
  retryClaimed: true,
};

test("a submission summary counts its calls, retries, failures and idle timeouts", () => {
  expect(summarizeSubmission(chronology, [idleTimeout])).toEqual({
    submissionId: "sub-1",
    outcome: "completed",
    loggedAt: "2026-11-03T10:00:30.000Z",
    calls: 2,
    models: ["anthropic/claude-sonnet-4-6"],
    maxTimeToFirstEventMs: 12_000,
    retries: 1,
    failed: 1,
    idleTimeouts: 1,
  });
  expect(renderSubmissionList([])).toBe(
    "No settled submissions in this window.",
  );
});

test("a submission's detail lists each call with who served it, its retry and its error, then the idle timeouts", () => {
  const markdown = renderSubmissionDetail({
    submissionId: "sub-1",
    chronology,
    idleTimeouts: [idleTimeout],
    spans: null,
  });

  expect(markdown).toContain(
    "| turn-1 | agent | anthropic/claude-sonnet-4-6 | claude-sonnet-4-6-20260101 | 2026-11-03T10:00:00.000Z | – | 3.0 s | – | model_stream_idle | 100/20 |",
  );
  expect(markdown).toContain("| 12 s | 3.0 s | turn-1 | – |");
  expect(markdown).toContain(
    "- 2026-11-03T10:00:20.000Z turn-1 anthropic/claude-sonnet-4-6: request_dispatch idle for 60 s, last event none; retry claimed",
  );
  // No trace source was read, so there is no spans section.
  expect(markdown).not.toContain("## Spans");
});

test("an unsettled submission says why it has no chronology", () => {
  expect(
    renderSubmissionDetail({
      submissionId: "sub-2",
      chronology: null,
      idleTimeouts: [],
      spans: [],
    }),
  ).toContain("No chronology line");
});
