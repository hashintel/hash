import { expect, test } from "vitest";

import {
  notesOf,
  renderSubmissionDetail,
  renderSubmissionList,
  summarizeSubmission,
} from "./render.ts";

import type {
  LoggedIdleTimeout,
  LoggedOutputLimit,
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
  outputTokens: 20,
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
      error: { type: "model_stream_idle", code: "model_stream_idle" },
    }),
    turn("turn-2", { retryOf: "turn-1", timeToFirstEventMs: 12_000 }),
  ],
};

/** Written before timeout lines carried their submission, so only its turn joins it. */
const idleTimeout: LoggedIdleTimeout = {
  timestamp: "2026-11-03T10:00:20.000Z",
  submissionId: null,
  turnId: "turn-1",
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  phase: "request_dispatch",
  idleMs: 60_000,
  lastEventType: null,
  acknowledged: true,
  retryClaimed: true,
};

const outputLimit: LoggedOutputLimit = {
  timestamp: "2026-11-03T10:00:25.000Z",
  submissionId: "sub-1",
  turnId: "turn-2",
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  outputTokens: 8_192,
};

test("a submission's idle timeouts are those logged under it or during one of its turns", () => {
  const underSubmission = {
    ...idleTimeout,
    submissionId: "sub-1",
    turnId: null,
  };
  const elsewhere = { ...idleTimeout, submissionId: "sub-2", turnId: "turn-9" };
  const logged = [idleTimeout, underSubmission, elsewhere];

  expect(notesOf("sub-1", chronology, logged)).toEqual([
    idleTimeout,
    underSubmission,
  ]);
  // Without a chronology there are no turns to match by.
  expect(notesOf("sub-1", null, logged)).toEqual([underSubmission]);
});

test("a submission summary counts its calls, retries, failures and the idle timeouts and output-limit stops logged under it or during its turns", () => {
  expect(
    summarizeSubmission(
      chronology,
      [
        idleTimeout,
        { ...idleTimeout, submissionId: "sub-1", turnId: null },
        { ...idleTimeout, submissionId: "sub-2", turnId: "turn-9" },
      ],
      [outputLimit, { ...outputLimit, submissionId: "sub-2", turnId: null }],
    ),
  ).toEqual({
    submissionId: "sub-1",
    outcome: "completed",
    loggedAt: "2026-11-03T10:00:30.000Z",
    calls: 2,
    models: ["anthropic/claude-sonnet-4-6"],
    maxTimeToFirstEventMs: 12_000,
    retries: 1,
    failed: 1,
    idleTimeouts: 2,
    outputLimits: 1,
  });
  expect(renderSubmissionList([])).toBe(
    "No settled submissions in this window.",
  );
});

test("a submission's detail lists each call with who served it, its retry, its error and the idle timeout that interrupted it", () => {
  const markdown = renderSubmissionDetail({
    submissionId: "sub-1",
    searched: "in the last 24h",
    chronology,
    idleTimeouts: [idleTimeout],
    outputLimits: [],
    spans: null,
  });

  expect(markdown).toContain(
    "| turn-1 | agent | anthropic/claude-sonnet-4-6 | claude-sonnet-4-6-20260101 | 2026-11-03T10:00:00.000Z | – | 3.0 s | – | model_stream_idle | request_dispatch idle 60 s, retry claimed | 100/20 |",
  );
  expect(markdown).toContain("| 12 s | 3.0 s | turn-1 | – | – | 100/20 |");
  // Every timeout sits beside its call, so there is no separate list.
  expect(markdown).not.toContain("## Idle timeouts");
  // No trace source was read, so there is no spans section.
  expect(markdown).not.toContain("## Spans");
});

test("an idle timeout whose turn is not among the calls is listed on its own", () => {
  const markdown = renderSubmissionDetail({
    submissionId: "sub-1",
    searched: "in the last 24h",
    chronology,
    idleTimeouts: [{ ...idleTimeout, turnId: "turn-9" }],
    outputLimits: [],
    spans: null,
  });

  expect(markdown).toContain(
    "## Idle timeouts outside these calls\n\n- 2026-11-03T10:00:20.000Z turn-9 anthropic/claude-sonnet-4-6: request_dispatch idle for 60 s, last event none; retry claimed",
  );
});

test("an idle timeout whose line dropped its retry field says so rather than reporting no retry", () => {
  const markdown = renderSubmissionDetail({
    submissionId: "sub-1",
    searched: "in the last 24h",
    chronology,
    idleTimeouts: [
      { ...idleTimeout, retryClaimed: null },
      { ...idleTimeout, turnId: "turn-2", retryClaimed: false },
    ],
    outputLimits: [],
    spans: null,
  });

  expect(markdown).toContain("request_dispatch idle 60 s, retry not logged");
  expect(markdown).toContain("request_dispatch idle 60 s, no retry");
});

test("an unsettled submission says where its chronology was looked for", () => {
  const markdown = renderSubmissionDetail({
    submissionId: "sub-2",
    searched: "in the last 24h",
    chronology: null,
    idleTimeouts: [],
    outputLimits: [],
    spans: [],
  });

  expect(markdown).toContain("No chronology line in the last 24h");
  expect(markdown).toContain("## Idle timeouts\n\nNone.");
  expect(markdown).not.toContain("## Output limits");
});

test("an output-limit stop names its call's error, which the turn reports only as an internal failure type", () => {
  const limited: LoggedSubmissionChronology = {
    ...chronology,
    outcome: "failed",
    turns: [
      turn("turn-2", { isError: true, error: { type: "_OTHER", code: null } }),
    ],
  };
  const markdown = renderSubmissionDetail({
    submissionId: "sub-1",
    searched: "in the last 24h",
    chronology: limited,
    idleTimeouts: [],
    outputLimits: [outputLimit, { ...outputLimit, turnId: "turn-9" }],
    spans: null,
  });

  expect(markdown).toContain("| – | output limit at 8192 tokens | – |");
  expect(markdown).not.toContain("_OTHER");
  expect(markdown).toContain(
    "## Output limits outside these calls\n\n- 2026-11-03T10:00:25.000Z turn-9 anthropic/claude-sonnet-4-6: output limit at 8192 tokens",
  );
});
