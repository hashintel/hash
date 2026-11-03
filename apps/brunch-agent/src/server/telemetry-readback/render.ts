import {
  requestedModelOf,
  turnErrorOf,
  type LoggedIdleTimeout,
  type LoggedSubmissionChronology,
  type LoggedTurnChronology,
  type ModelCallSpan,
} from "./shared/records.ts";

export const seconds = (ms: number | null | undefined): string =>
  ms === null || ms === undefined
    ? "–"
    : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;

export const table = (
  header: readonly string[],
  rows: readonly (readonly string[])[],
): string =>
  [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");

const modelOf = (turn: LoggedTurnChronology): string =>
  requestedModelOf(turn) ?? "–";

const turnIdsOf = (
  chronology: LoggedSubmissionChronology | null,
): ReadonlySet<string> =>
  new Set(chronology?.turns.map((turn) => turn.turnId) ?? []);

/** The idle timeouts logged under a submission or during one of its turns. */
export const idleTimeoutsOf = (
  submissionId: string,
  chronology: LoggedSubmissionChronology | null,
  idleTimeouts: readonly LoggedIdleTimeout[],
): LoggedIdleTimeout[] => {
  const turnIds = turnIdsOf(chronology);
  return idleTimeouts.filter(
    (timeout) =>
      timeout.submissionId === submissionId ||
      (timeout.turnId !== null && turnIds.has(timeout.turnId)),
  );
};

const timeoutOutcome = (timeout: LoggedIdleTimeout): string =>
  timeout.acknowledged === false
    ? "cancellation not acknowledged"
    : timeout.retryClaimed
      ? "retry claimed"
      : "no retry";

/** A timeout beside the call it interrupted. */
const timeoutCell = (timeout: LoggedIdleTimeout): string =>
  `${timeout.phase ?? "?"} idle ${seconds(timeout.idleMs)}, ${timeoutOutcome(timeout)}`;

/** A timeout on its own line, naming its call. */
const timeoutText = (timeout: LoggedIdleTimeout): string =>
  [
    timeout.timestamp ?? "–",
    timeout.turnId ?? "(no turn id)",
    `${timeout.provider ?? "?"}/${timeout.model ?? "?"}:`,
    `${timeout.phase ?? "?"} idle for ${seconds(timeout.idleMs)}, last event ${timeout.lastEventType ?? "none"};`,
    timeoutOutcome(timeout),
  ].join(" ");

export type SubmissionSummary = {
  readonly submissionId: string;
  readonly outcome: string;
  readonly loggedAt: string | null;
  readonly calls: number;
  readonly models: readonly string[];
  readonly maxTimeToFirstEventMs: number | null;
  readonly retries: number;
  readonly failed: number;
  readonly idleTimeouts: number;
};

export const summarizeSubmission = (
  chronology: LoggedSubmissionChronology,
  idleTimeouts: readonly LoggedIdleTimeout[],
): SubmissionSummary => {
  const firstEvents = chronology.turns.flatMap((turn) =>
    turn.timeToFirstEventMs === null ? [] : [turn.timeToFirstEventMs],
  );
  return {
    submissionId: chronology.submissionId,
    outcome: chronology.outcome,
    loggedAt: chronology.timestamp ?? null,
    calls: chronology.turns.length,
    models: [...new Set(chronology.turns.map(modelOf))],
    maxTimeToFirstEventMs:
      firstEvents.length === 0 ? null : Math.max(...firstEvents),
    retries: chronology.turns.filter((turn) => turn.retryOf).length,
    failed: chronology.turns.filter((turn) => turn.isError).length,
    idleTimeouts: idleTimeoutsOf(
      chronology.submissionId,
      chronology,
      idleTimeouts,
    ).length,
  };
};

export const renderSubmissionList = (
  summaries: readonly SubmissionSummary[],
): string =>
  summaries.length === 0
    ? "No settled submissions in this window."
    : table(
        [
          "Logged",
          "Submission",
          "Outcome",
          "Calls",
          "Models",
          "Slowest first event",
          "Retries",
          "Failed",
          "Idle timeouts",
        ],
        summaries.map((summary) => [
          summary.loggedAt ?? "–",
          summary.submissionId,
          summary.outcome,
          String(summary.calls),
          summary.models.join(", "),
          seconds(summary.maxTimeToFirstEventMs),
          String(summary.retries),
          String(summary.failed),
          String(summary.idleTimeouts),
        ]),
      );

export type SubmissionDetail = {
  readonly submissionId: string;
  /** Where the chronology was looked for, as a phrase: `in the last 24h`, `in server.log`. */
  readonly searched: string;
  /** Absent when the submission has not settled, or its line was not kept. */
  readonly chronology: LoggedSubmissionChronology | null;
  readonly idleTimeouts: readonly LoggedIdleTimeout[];
  /** Null when no trace source was read. */
  readonly spans: readonly ModelCallSpan[] | null;
};

export const renderSubmissionDetail = (detail: SubmissionDetail): string => {
  const { chronology, idleTimeouts, spans } = detail;
  const turnIds = turnIdsOf(chronology);
  const unmatched = idleTimeouts.filter(
    (timeout) => timeout.turnId === null || !turnIds.has(timeout.turnId),
  );
  const lines = [
    `# Submission ${detail.submissionId}`,
    "",
    chronology
      ? `${chronology.outcome}, logged ${chronology.timestamp ?? "at an unknown time"}.`
      : `No chronology line ${detail.searched}: the submission has not settled, or its log was not kept.`,
  ];
  if (chronology && chronology.turns.length > 0) {
    lines.push(
      "",
      "## Model calls",
      "",
      table(
        [
          "Turn",
          "Purpose",
          "Model",
          "Served by",
          "Started",
          "First event",
          "Duration",
          "Retry of",
          "Error",
          "Idle timeout",
          "Tokens in/out",
        ],
        chronology.turns.map((turn) => [
          turn.turnId,
          turn.purpose,
          modelOf(turn),
          turn.responseModel ?? "–",
          turn.startedAt ?? "–",
          seconds(turn.timeToFirstEventMs),
          `${seconds(turn.durationMs)}${turn.terminal === "settlement" ? " (unfinished)" : ""}`,
          turn.retryOf ?? "–",
          turnErrorOf(turn) ?? "–",
          idleTimeouts
            .filter((timeout) => timeout.turnId === turn.turnId)
            .map(timeoutCell)
            .join("; ") || "–",
          `${turn.inputTokens ?? "–"}/${turn.outputTokens ?? "–"}`,
        ]),
      ),
    );
  }
  if (turnIds.size === 0 || unmatched.length > 0) {
    lines.push(
      "",
      turnIds.size === 0
        ? "## Idle timeouts"
        : "## Idle timeouts outside these calls",
      "",
      ...(unmatched.length === 0
        ? ["None."]
        : unmatched.map((timeout) => `- ${timeoutText(timeout)}`)),
    );
  }
  if (spans !== null) {
    const traceIds = [...new Set(spans.map((span) => span.traceId))];
    lines.push(
      "",
      `## Spans${traceIds.length === 0 ? "" : ` (trace ${traceIds.join(", ")})`}`,
      "",
      spans.length === 0
        ? "No model-call spans found."
        : table(
            [
              "Turn",
              "Model",
              "Started",
              "Duration",
              "Status",
              "Finish",
              "HTTP requests",
            ],
            spans.map((span) => [
              span.turnId ?? "–",
              `${span.provider ?? "?"}/${span.requestedModel ?? "?"}`,
              span.startedAt,
              seconds(span.durationMs),
              span.failed
                ? `error${span.errorType ? ` ${span.errorType}` : ""}`
                : "ok",
              span.finishReasons.join(", ") || "–",
              span.httpRequests
                .map(
                  (request) =>
                    `${request.statusCode ?? "?"} (${seconds(request.durationMs)})`,
                )
                .join(", ") || "–",
            ]),
          ),
    );
  }
  return lines.join("\n");
};
