import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { logLiveDiagnostic } from "./live-diagnostic";

import type { MockInstance } from "vitest";

let trace: MockInstance<(...args: unknown[]) => void>;
let readable: MockInstance<(...args: unknown[]) => void>;

beforeEach(() => {
  vi.stubEnv("DEV", true);
  vi.stubGlobal("window", { location: { search: "?voiceDebug=1" } });
  trace = vi.spyOn(console, "debug").mockImplementation(() => {});
  readable = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test.each(["", "?voiceDebug=0", "?voiceDebug=true", "?other=1"])(
  "keeps structured traces but adds no readable lines for %s",
  (search) => {
    vi.stubGlobal("window", { location: { search } });
    logLiveDiagnostic("brunch.submit", { inputId: "utterance-1" });
    expect(trace).toHaveBeenCalledOnce();
    expect(readable).not.toHaveBeenCalled();
  },
);

test("does not log in production even with the parameter", () => {
  vi.stubEnv("DEV", false);
  logLiveDiagnostic("brunch.admitted", {
    inputId: "utterance-1",
    submissionId: "submission-9",
  });
  expect(trace).not.toHaveBeenCalled();
  expect(readable).not.toHaveBeenCalled();
});

test("does not require a browser for existing traces", () => {
  vi.stubGlobal("window", undefined);
  logLiveDiagnostic("brunch.submit", { inputId: "utterance-1" });
  expect(trace).toHaveBeenCalledOnce();
  expect(readable).not.toHaveBeenCalled();
});

test("distinguishes submission from admission without changing structured traces", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-24T12:00:00.000Z"));
  try {
    logLiveDiagnostic("brunch.submit", { inputId: "utterance-1" });
    logLiveDiagnostic("brunch.admitted", {
      inputId: "utterance-1",
      submissionId: "submission-9",
    });
    expect(trace).toHaveBeenNthCalledWith(
      1,
      '[Petrinaut Live trace] {"at":"2026-09-24T12:00:00.000Z","event":"brunch.submit","inputId":"utterance-1"}',
    );
    expect(readable).toHaveBeenNthCalledWith(
      1,
      '[Petrinaut Voice debug] Submission attempted; awaiting admission {"inputId":"utterance-1"}',
    );
    expect(readable).toHaveBeenNthCalledWith(
      2,
      '[Petrinaut Voice debug] Reached Brunch {"inputId":"utterance-1","submissionId":"submission-9"}',
    );
  } finally {
    vi.useRealTimers();
  }
});

test("labels log-only recommendations without claiming to withhold", () => {
  const metadata = Object.freeze({
    inputId: "utterance-2",
    mode: "log",
    contribution: "social_or_backchannel",
    confidence: 0.99,
    latencyMs: 732,
    decision: "withhold",
    applied: "submit",
  });
  logLiveDiagnostic("judgment.result", metadata);
  expect(readable).toHaveBeenCalledWith(
    '[Petrinaut Voice debug] Judgment only; submissions unchanged {"inputId":"utterance-2","mode":"log","contribution":"social_or_backchannel","confidence":0.99,"latencyMs":732,"decision":"withhold","applied":"submit"}',
  );
});

test.each([
  { applied: "withhold", timedOut: false, label: "Withheld by gate" },
  { applied: "submit", timedOut: false, label: "Submit allowed by gate" },
  {
    applied: "submit",
    timedOut: true,
    label: "Submit allowed: judgment timed out (fail-open)",
  },
])("reports enforcement outcome: $label", ({ applied, timedOut, label }) => {
  logLiveDiagnostic("judgment.result", {
    inputId: "utterance-3",
    mode: "enforce",
    applied,
    timedOut,
  });
  expect(readable).toHaveBeenCalledWith(
    `[Petrinaut Voice debug] ${label} {"inputId":"utterance-3","mode":"enforce","applied":"${applied}","timedOut":${timedOut}}`,
  );
});

test.each([
  {
    submissionId: undefined,
    label: "Admission unconfirmed; check canonical history before retrying",
  },
  {
    submissionId: "submission-9",
    label: "Reached Brunch; response unconfirmed",
  },
])("preserves admission evidence: $label", ({ submissionId, label }) => {
  logLiveDiagnostic("brunch.unconfirmed", {
    inputId: "utterance-1",
    submissionId,
  });
  expect(readable).toHaveBeenCalledWith(
    expect.stringContaining(`[Petrinaut Voice debug] ${label} `),
  );
});

test.each([
  ["input.finalized", "Transcript finalized"],
  ["input.ignored", "Ignored by bridge"],
  ["input.dropped", "Not submitted by bridge"],
  ["judgment.released", "Manually released; awaiting submission"],
])("reports %s using only selected metadata", (event, label) => {
  logLiveDiagnostic(event, {
    inputId: "utterance-4",
    transcript: "PRIVATE spoken words",
    relayedBrunchText: "PRIVATE relayed prose",
    unexpectedField: "PRIVATE payload",
  });
  expect(readable).toHaveBeenCalledWith(
    `[Petrinaut Voice debug] ${label} {"inputId":"utterance-4"}`,
  );
});

test("leaves unrelated events in structured traces only", () => {
  logLiveDiagnostic("provider.event", { type: "response.created" });
  expect(trace).toHaveBeenCalledOnce();
  expect(readable).not.toHaveBeenCalled();
});
