import { describe, expect, test } from "vitest";

import scenarios from "./scenarios.json";
import { checkTrace } from "./trace-checks.ts";

import type { LatencyMark, Scenario, Trace } from "./trace-checks.ts";

const scenario = (id: string): Scenario => {
  const selected = scenarios.find((entry) => entry.id === id);
  if (!selected) throw new Error(`Missing scenario ${id}`);
  return selected as Scenario;
};

const marks = (itemId = "item1", start = 100): LatencyMark[] =>
  [
    ["user-speech-ended", 0],
    ["submission-admitted", 300],
    ["first-acknowledgement-audio", 1_200],
    ["speech-ended", 2_000],
    ["first-canonical-text", 4_000],
    ["submission-settled", 9_000],
    ["first-tts-request", 9_100],
    ["first-tts-audio", 9_800],
  ].map(([name, elapsedMs]) => ({
    name: String(name),
    elapsedMs: Number(elapsedMs),
    observedAtMs: start + Number(elapsedMs),
    correlationId: `voice-realtime:1:${itemId}:0`,
  }));

const goodTrace: Trace = {
  canonicalBubbles: [
    "Reserving a dispatch crew means it is unavailable elsewhere.",
  ],
  commits: [{ itemId: "item1", observedAtMs: 100 }],
  diagnostics: [
    {
      operation: "speech",
      outcome: "success",
      speechKind: "acknowledgement",
      durationMs: 900,
      requestId: "r1",
      stage: "browser",
    },
    {
      operation: "speech",
      outcome: "success",
      speechKind: "paraphrase",
      durationMs: 4_000,
      requestId: "r2",
      stage: "browser",
    },
  ],
  finalPhase: "listening",
  inputTranscripts: ["What does reserving a DISPATCH CREW mean here?"],
  latency: marks(),
  notHeard: false,
  outputAudioSeconds: 6.2,
  outputAudioBytes: 24_000,
  fixtureRevisionBefore: 0,
  fixtureRevisionAfter: 0,
};

const level = (id: string, trace: Trace, name: string) =>
  checkTrace(scenario(id), trace).find((check) => check.name === name)?.level;

describe("checkTrace", () => {
  test("complete short clarification passes all hard checks", () => {
    expect(
      checkTrace(scenario("short-clarification"), goodTrace).filter(
        (check) => check.level === "fail",
      ),
    ).toEqual([]);
  });

  test.each(["submission-settled", "first-canonical-text", "first-tts-audio"])(
    "missing %s fails rather than vacuously passing",
    (missing) =>
      expect(
        level(
          "short-clarification",
          {
            ...goodTrace,
            latency: marks().filter((mark) => mark.name !== missing),
          },
          "sequence",
        ),
      ).toBe("fail"),
  );

  test("settlement from another turn cannot authorize this turn's paraphrase", () => {
    const latency = marks().map((mark) =>
      mark.name === "submission-settled"
        ? { ...mark, correlationId: "voice-realtime:1:other:0" }
        : mark,
    );
    expect(
      level("short-clarification", { ...goodTrace, latency }, "sequence"),
    ).toBe("fail");
  });

  test.each([8_999, Number.NaN])(
    "rejects premature or invalid TTS time %s",
    (elapsedMs) => {
      const latency = marks().map((mark) =>
        mark.name === "first-tts-request" ? { ...mark, elapsedMs } : mark,
      );
      expect(
        level("short-clarification", { ...goodTrace, latency }, "sequence"),
      ).toBe("fail");
    },
  );

  test("latency uses user speech end, not output speech end, and warns above the boundary", () => {
    const trace = (elapsedMs: number): Trace => ({
      ...goodTrace,
      latency: marks().map((mark) =>
        mark.name === "first-acknowledgement-audio"
          ? { ...mark, elapsedMs }
          : mark,
      ),
    });
    expect(level("short-clarification", trace(2_000), "latency-ack")).toBe(
      "pass",
    );
    expect(level("short-clarification", trace(2_001), "latency-ack")).toBe(
      "warn",
    );
  });

  test("speech without an application kind fails the diagnostic check", () => {
    const diagnostics = [
      ...goodTrace.diagnostics,
      {
        operation: "speech",
        outcome: "success",
        durationMs: 3,
        requestId: "r3",
        stage: "browser",
      },
    ];
    expect(
      level(
        "short-clarification",
        { ...goodTrace, diagnostics },
        "no-autonomous-output",
      ),
    ).toBe("fail");
  });

  test("input phrases are case insensitive but missing words fail", () => {
    expect(level("short-clarification", goodTrace, "input-transcript")).toBe(
      "pass",
    );
    expect(
      level(
        "short-clarification",
        { ...goodTrace, inputTranscripts: ["dispatch a crew"] },
        "input-transcript",
      ),
    ).toBe("fail");
  });

  test("duplicate or empty canonical bubbles fail", () => {
    for (const canonicalBubbles of [["a", "a"], [""], []]) {
      expect(
        level(
          "short-clarification",
          { ...goodTrace, canonicalBubbles },
          "canonical-bubbles",
        ),
      ).toBe("fail");
    }
  });

  test("short, empty, and invalid recordings fail", () => {
    for (const outputAudioSeconds of [0.4, Number.NaN]) {
      expect(
        level(
          "short-clarification",
          { ...goodTrace, outputAudioSeconds },
          "output-audio",
        ),
      ).toBe("fail");
    }
    expect(
      level(
        "short-clarification",
        { ...goodTrace, outputAudioBytes: 0 },
        "output-audio",
      ),
    ).toBe("fail");
    expect(
      level(
        "short-clarification",
        { ...goodTrace, finalPhase: "speaking" },
        "final-phase",
      ),
    ).toBe("fail");
  });

  test("long analysis requires an observed, unchanged revision", () => {
    expect(level("long-analysis", goodTrace, "fixture-revision")).toBe("pass");
    expect(
      level(
        "long-analysis",
        { ...goodTrace, fixtureRevisionAfter: 1 },
        "fixture-revision",
      ),
    ).toBe("fail");
    expect(
      level(
        "long-analysis",
        {
          ...goodTrace,
          fixtureRevisionBefore: null,
          fixtureRevisionAfter: null,
        },
        "fixture-revision",
      ),
    ).toBe("fail");
  });

  test("barge-in requires a performed action, an aborted paraphrase, and retained canonical text", () => {
    const trace: Trace = {
      ...goodTrace,
      canonicalBeforeInterruption: goodTrace.canonicalBubbles,
      interruptedAtMs: 10_000,
      diagnostics: goodTrace.diagnostics.map((line) =>
        line.speechKind === "paraphrase"
          ? { ...line, outcome: "aborted" }
          : line,
      ),
    };
    expect(level("barge-in", trace, "interrupted")).toBe("pass");
    expect(level("barge-in", goodTrace, "interrupted")).toBe("fail");
    expect(
      level(
        "barge-in",
        { ...trace, canonicalBubbles: ["replacement"] },
        "interrupted",
      ),
    ).toBe("fail");
    expect(
      level(
        "barge-in",
        { ...trace, diagnostics: goodTrace.diagnostics },
        "interrupted",
      ),
    ).toBe("fail");
  });

  test("hesitant speech distinguishes two provider commits from one admitted question", () => {
    expect(level("hesitant-speech", goodTrace, "commits")).toBe("pass");
    const commits = [
      ...goodTrace.commits,
      { itemId: "half-question", observedAtMs: 50 },
    ];
    expect(level("hesitant-speech", { ...goodTrace, commits }, "commits")).toBe(
      "fail",
    );
  });

  const queuedTrace: Trace = {
    ...goodTrace,
    commits: [...goodTrace.commits, { itemId: "item2", observedAtMs: 5_100 }],
    inputTranscripts: [
      "Detailed analysis; do not change the model",
      "What does reserving a dispatch crew mean here?",
    ],
    canonicalBubbles: ["Analysis", "Crew explanation"],
    latency: [
      ...marks(),
      ...marks("item2", 5_100).map((mark) =>
        mark.name === "submission-admitted"
          ? { ...mark, elapsedMs: 4_100, observedAtMs: 9_200 }
          : mark.name === "first-canonical-text"
            ? { ...mark, elapsedMs: 4_400, observedAtMs: 9_500 }
            : mark,
      ),
      {
        name: "queued",
        correlationId: "voice-realtime:1:item2:0",
        elapsedMs: 200,
        observedAtMs: 5_300,
      },
    ].sort((left, right) => left.observedAtMs - right.observedAtMs),
  };

  test("follow-up requires both admissions in capture order and a queue mark while the first turn works", () => {
    expect(
      checkTrace(scenario("follow-up-while-working"), queuedTrace).filter(
        (check) => check.level === "fail",
      ),
    ).toEqual([]);
    expect(level("follow-up-while-working", queuedTrace, "queued-order")).toBe(
      "pass",
    );
    expect(
      level(
        "follow-up-while-working",
        {
          ...queuedTrace,
          latency: queuedTrace.latency.filter((mark) => mark.name !== "queued"),
        },
        "queued-order",
      ),
    ).toBe("fail");
    expect(
      level(
        "follow-up-while-working",
        { ...queuedTrace, commits: [...queuedTrace.commits].reverse() },
        "queued-order",
      ),
    ).toBe("fail");
    expect(
      level(
        "follow-up-while-working",
        {
          ...queuedTrace,
          latency: queuedTrace.latency.map((mark) =>
            mark.name === "queued" ? { ...mark, observedAtMs: 9_500 } : mark,
          ),
        },
        "queued-order",
      ),
    ).toBe("fail");
    expect(
      level(
        "follow-up-while-working",
        {
          ...queuedTrace,
          latency: queuedTrace.latency.filter(
            (mark) =>
              !(
                mark.name === "submission-admitted" &&
                mark.correlationId.includes("item2")
              ),
          ),
        },
        "queued-order",
      ),
    ).toBe("fail");
  });

  test("follow-up phrases must match their own turn, not a concatenated transcript", () => {
    expect(
      level("follow-up-while-working", queuedTrace, "input-transcript"),
    ).toBe("pass");
    expect(
      level(
        "follow-up-while-working",
        {
          ...queuedTrace,
          inputTranscripts: [...queuedTrace.inputTranscripts].reverse(),
        },
        "input-transcript",
      ),
    ).toBe("fail");
  });

  test("one-word answer permits admission or explicit not-heard, never silence", () => {
    const admitted: Trace = { ...goodTrace, inputTranscripts: ["Yes."] };
    expect(
      checkTrace(scenario("one-word-answer"), admitted).filter(
        (check) => check.level === "fail",
      ),
    ).toEqual([]);
    const rejected: Trace = {
      ...goodTrace,
      latency: [],
      inputTranscripts: [],
      canonicalBubbles: [],
      diagnostics: [],
      notHeard: true,
      outputAudioSeconds: 0,
      outputAudioBytes: 0,
    };
    expect(
      checkTrace(scenario("one-word-answer"), rejected).filter(
        (check) => check.level === "fail",
      ),
    ).toEqual([]);
    expect(
      level(
        "one-word-answer",
        { ...rejected, notHeard: false },
        "admission-or-not-heard",
      ),
    ).toBe("fail");
    expect(
      level(
        "one-word-answer",
        {
          ...admitted,
          notHeard: true,
          latency: admitted.latency.filter(
            (mark) => mark.name !== "submission-settled",
          ),
        },
        "sequence",
      ),
    ).toBe("fail");
  });

  test("recording an operational failure cannot produce an all-green verdict", () => {
    expect(
      level(
        "short-clarification",
        { ...goodTrace, error: "terminal timeout" },
        "run",
      ),
    ).toBe("fail");
  });
});
