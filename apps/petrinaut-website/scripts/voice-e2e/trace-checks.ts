export interface LatencyMark {
  readonly name: string;
  readonly elapsedMs: number;
  readonly correlationId: string;
  /** Observer receipt time, since product measures all have startTime = 0. */
  readonly observedAtMs: number;
}

export interface DiagnosticLine {
  readonly operation: string;
  readonly outcome: string;
  readonly durationMs: number;
  readonly speechKind?: string;
  readonly requestId: string;
  readonly stage: string;
  readonly errorCode?: string;
  readonly status?: number;
}

export interface InputCommit {
  readonly itemId: string;
  readonly observedAtMs: number;
}

export interface Trace {
  readonly canonicalBubbles: readonly string[];
  readonly canonicalBeforeInterruption?: readonly string[];
  readonly commits: readonly InputCommit[];
  readonly diagnostics: readonly DiagnosticLine[];
  readonly error?: string;
  readonly finalPhase: string;
  readonly fixtureRevisionBefore: number | null;
  readonly fixtureRevisionAfter: number | null;
  readonly inputTranscripts: readonly string[];
  readonly interruptedAtMs?: number;
  readonly latency: readonly LatencyMark[];
  readonly notHeard: boolean;
  readonly outputAudioSeconds: number;
  readonly outputAudioBytes: number;
}

export interface Scenario {
  readonly action?: "take-turn-during-paraphrase" | "follow-up-while-working";
  readonly allowNotHeard?: boolean;
  readonly budgetsMs: {
    readonly speechEndToAckAudio: number;
    readonly readyToTtsAudio: number;
  };
  readonly expectInputPhrases: readonly string[];
  readonly expectUnchangedRevision?: boolean;
  readonly followUp?: {
    readonly utterance: string;
    readonly expectInputPhrases: readonly string[];
    readonly delaySeconds: number;
  };
  readonly id: string;
  readonly utterance: string;
}

export interface CheckResult {
  readonly name: string;
  readonly level: "pass" | "warn" | "fail";
  readonly detail: string;
}

export const checkTrace = (scenario: Scenario, trace: Trace): CheckResult[] => {
  const results: CheckResult[] = [];
  const check = (name: string, passed: boolean, detail: string) => {
    results.push({ name, level: passed ? "pass" : "fail", detail });
  };
  const admissions = trace.latency.filter(
    (mark) => mark.name === "submission-admitted",
  );
  const rejected =
    scenario.allowNotHeard === true &&
    admissions.length === 0 &&
    trace.notHeard;
  const expectedTurns = scenario.followUp ? 2 : 1;
  const markOf = (name: string, correlationId: string) =>
    trace.latency.find(
      (mark) => mark.name === name && mark.correlationId === correlationId,
    );
  const belongsTo = (
    mark: LatencyMark | undefined,
    commit: InputCommit | undefined,
  ) =>
    mark !== undefined &&
    commit !== undefined &&
    mark.correlationId.endsWith(`:${encodeURIComponent(commit.itemId)}:0`);

  check(
    "run",
    trace.error === undefined,
    trace.error ?? "Run reached its terminal condition",
  );
  if (scenario.allowNotHeard) {
    check(
      "admission-or-not-heard",
      admissions.length === 1 || rejected,
      `${admissions.length} admissions; not-heard notice ${trace.notHeard ? "observed" : "absent"}`,
    );
  }
  check(
    "commits",
    rejected || trace.commits.length === expectedTurns,
    `${trace.commits.length} distinct provider commits; expected ${expectedTurns}${rejected ? " (explicit not-heard outcome)" : ""}`,
  );

  if (!rejected) {
    const problems: string[] = [];
    for (const mark of trace.latency) {
      if (
        (mark.name === "first-tts-request" ||
          mark.name === "first-tts-audio") &&
        !admissions.some(
          (admission) => admission.correlationId === mark.correlationId,
        )
      ) {
        problems.push(
          `${mark.correlationId}: TTS without a matching admission`,
        );
      }
    }
    if (admissions.length !== expectedTurns)
      problems.push(
        `expected ${expectedTurns} admissions, got ${admissions.length}`,
      );
    for (const [index, admission] of admissions.entries()) {
      const correlationId = admission.correlationId;
      if (!belongsTo(admission, trace.commits[index]))
        problems.push(`admission ${index + 1} does not match capture order`);
      const required = [
        "user-speech-ended",
        "submission-admitted",
        "first-canonical-text",
        "submission-settled",
      ];
      // A queued follow-up can supersede the first turn's speech. Its canonical
      // answer must still settle; any TTS that does occur must remain gated.
      const needsSpeech =
        index === admissions.length - 1 || scenario.followUp === undefined;
      if (needsSpeech)
        required.push(
          "first-acknowledgement-audio",
          "first-tts-request",
          "first-tts-audio",
        );
      for (const name of required) {
        if (!markOf(name, correlationId))
          problems.push(`${correlationId}: missing ${name}`);
      }
      for (const mark of trace.latency.filter(
        (entry) => entry.correlationId === correlationId,
      )) {
        if (
          !Number.isFinite(mark.elapsedMs) ||
          mark.elapsedMs < 0 ||
          !Number.isFinite(mark.observedAtMs)
        ) {
          problems.push(`${correlationId}: invalid ${mark.name} timing`);
        }
      }
      for (const [before, after] of [
        ["user-speech-ended", "submission-admitted"],
        ["user-speech-ended", "first-acknowledgement-audio"],
        ["submission-admitted", "first-canonical-text"],
        ["first-canonical-text", "submission-settled"],
        ["submission-settled", "first-tts-request"],
        ["first-tts-request", "first-tts-audio"],
      ] as const) {
        const earlier = markOf(before, correlationId);
        const later = markOf(after, correlationId);
        if (later && (!earlier || earlier.elapsedMs > later.elapsedMs))
          problems.push(`${correlationId}: ${after} before ${before}`);
      }
    }
    check(
      "sequence",
      problems.length === 0,
      problems.join("; ") ||
        "Correlated input → admission → canonical text → settlement → TTS",
    );
    const phraseSets = [
      scenario.expectInputPhrases,
      ...(scenario.followUp ? [scenario.followUp.expectInputPhrases] : []),
    ];
    const transcriptOk =
      trace.inputTranscripts.length === expectedTurns &&
      phraseSets.every((phrases, index) => {
        const transcript = trace.inputTranscripts[index]?.toLowerCase() ?? "";
        return phrases.every((phrase) =>
          transcript.includes(phrase.toLowerCase()),
        );
      });
    check(
      "input-transcript",
      transcriptOk,
      trace.inputTranscripts.join(" | ") || "No Voice transcript",
    );
    for (const [name, start, end, budget] of [
      [
        "latency-ack",
        "user-speech-ended",
        "first-acknowledgement-audio",
        scenario.budgetsMs.speechEndToAckAudio,
      ],
      [
        "latency-tts",
        "submission-settled",
        "first-tts-audio",
        scenario.budgetsMs.readyToTtsAudio,
      ],
    ] as const) {
      const durations = admissions.flatMap((admission) => {
        const earlier = markOf(start, admission.correlationId);
        const later = markOf(end, admission.correlationId);
        return earlier && later ? [later.elapsedMs - earlier.elapsedMs] : [];
      });
      results.push({
        name,
        level:
          durations.length > 0 &&
          durations.every(
            (duration) =>
              Number.isFinite(duration) && duration >= 0 && duration <= budget,
          )
            ? "pass"
            : "warn",
        detail: `${durations.join(", ") || "unavailable"} ms; budget ${budget} ms (provider-buffer proxy)`,
      });
    }
  } else {
    results.push({
      name: "input-transcript",
      level: "warn",
      detail: "Explicit not-heard notice; no admitted answer expected",
    });
  }

  const autonomous = trace.diagnostics.filter(
    (line) =>
      line.operation === "speech" &&
      ![
        "acknowledgement",
        "bridging",
        "progress",
        "paraphrase",
        "exact-read",
      ].includes(line.speechKind ?? ""),
  );
  check(
    "no-autonomous-output",
    autonomous.length === 0,
    `${autonomous.length} speech diagnostics without a recognized application speechKind; diagnostic coverage only`,
  );
  check(
    "diagnostics",
    trace.diagnostics.every((line) => line.outcome !== "failure"),
    `${trace.diagnostics.filter((line) => line.outcome === "failure").length} failed Voice operations`,
  );
  check(
    "canonical-bubbles",
    trace.canonicalBubbles.length === (rejected ? 0 : expectedTurns) &&
      trace.canonicalBubbles.every((text) => text.trim().length > 0),
    `${trace.canonicalBubbles.length} canonical assistant bubbles`,
  );
  check("final-phase", trace.finalPhase === "listening", trace.finalPhase);
  if (rejected) {
    results.push({
      name: "output-audio",
      level: "warn",
      detail: "Audio is not required for the explicit not-heard outcome",
    });
  } else {
    check(
      "output-audio",
      Number.isFinite(trace.outputAudioSeconds) &&
        trace.outputAudioSeconds >= 1 &&
        trace.outputAudioBytes > 0,
      `${trace.outputAudioSeconds} s recorded, ${trace.outputAudioBytes} bytes; requires listening review`,
    );
    check(
      "paraphrase",
      trace.diagnostics.some(
        (line) =>
          line.operation === "speech" &&
          line.speechKind === "paraphrase" &&
          (line.outcome === "success" ||
            (scenario.action === "take-turn-during-paraphrase" &&
              line.outcome === "aborted")),
      ),
      "Terminal paraphrase diagnostic",
    );
  }

  if (scenario.expectUnchangedRevision) {
    check(
      "fixture-revision",
      trace.fixtureRevisionBefore !== null &&
        trace.fixtureRevisionAfter === trace.fixtureRevisionBefore,
      `${trace.fixtureRevisionBefore} → ${trace.fixtureRevisionAfter}`,
    );
  }
  if (scenario.action === "take-turn-during-paraphrase") {
    check(
      "interrupted",
      trace.interruptedAtMs !== undefined &&
        trace.canonicalBeforeInterruption !== undefined &&
        trace.canonicalBeforeInterruption.length > 0 &&
        JSON.stringify(trace.canonicalBeforeInterruption) ===
          JSON.stringify(trace.canonicalBubbles) &&
        trace.diagnostics.some(
          (line) =>
            line.operation === "speech" &&
            line.speechKind === "paraphrase" &&
            line.outcome === "aborted",
        ),
      "Your turn clicked; paraphrase aborted; pre-interruption canonical text retained",
    );
  }
  if (scenario.followUp) {
    const [first, second] = admissions;
    const settled = first && markOf("submission-settled", first.correlationId);
    const queued = second && markOf("queued", second.correlationId);
    check(
      "queued-order",
      admissions.length === 2 &&
        belongsTo(first, trace.commits[0]) &&
        belongsTo(second, trace.commits[1]) &&
        first !== undefined &&
        second !== undefined &&
        queued !== undefined &&
        settled !== undefined &&
        trace.latency.indexOf(first) < trace.latency.indexOf(queued) &&
        trace.latency.indexOf(queued) < trace.latency.indexOf(settled) &&
        trace.latency.indexOf(settled) < trace.latency.indexOf(second) &&
        first.observedAtMs <= queued.observedAtMs &&
        queued.observedAtMs <= settled.observedAtMs &&
        settled.observedAtMs <= second.observedAtMs,
      "Two capture-ordered admissions; follow-up queued while first turn was admitted but unsettled",
    );
  }
  return results;
};
