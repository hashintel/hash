/**
 * Read Brunch's provider telemetry back: which model served each call, how
 * long until it started responding, which calls were retries, which failed,
 * and the idle timeouts, joined with each call's span. Metadata only.
 *
 * From Grafana (the local stack at http://localhost:3001 by default; run the
 * server with `HASH_OTLP_ENDPOINT=http://localhost:4317` so it exports):
 *
 *   yarn workspace @apps/brunch-agent diagnose                       # submissions in the last hour
 *   yarn workspace @apps/brunch-agent diagnose --submission sub_…    # one submission, with spans
 *   GRAFANA_TOKEN=… yarn workspace @apps/brunch-agent diagnose --grafana https://… --since 1d
 *
 * From log text, a file or `-` for stdin (no spans):
 *
 *   yarn workspace @apps/brunch-agent diagnose --log dev-brunch-server.log
 *
 * `--json` prints the records instead of tables. Lines that could not be read
 * and reads cut off at a source's limit are reported on stderr.
 */

import { readFile } from "node:fs/promises";
import { text } from "node:stream/consumers";
import { parseArgs } from "node:util";

import {
  createGrafanaReader,
  idleTimeoutsOf,
  parseBrunchLog,
  renderSubmissionDetail,
  renderSubmissionList,
  summarizeSubmission,
  type LoggedIdleTimeout,
  type LoggedSubmissionChronology,
  type ReadResult,
  type SubmissionDetail,
  type TimeWindow,
} from "./telemetry-readback.ts";

const usage = `usage: diagnose [--submission <id>] [--since <30m|6h|2d>] [--json]
                [--grafana <url>] [--service <name>] [--log <file|->]`;

const { values } = parseArgs({
  options: {
    submission: { type: "string" },
    since: { type: "string" },
    json: { type: "boolean", default: false },
    grafana: { type: "string", default: "http://localhost:3001" },
    service: { type: "string", default: "Brunch Agent" },
    log: { type: "string" },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  process.stdout.write(`${usage}\n`);
  process.exit(0);
}

const durationUnits = { m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

const windowEndingNow = (since: string): TimeWindow => {
  const match = /^(\d+)([mhd])$/.exec(since);
  if (!match?.[1] || !match[2]) {
    process.stderr.write(`--since takes a number and m, h or d.\n${usage}\n`);
    process.exit(1);
  }
  const end = new Date();
  const unit = durationUnits[match[2] as keyof typeof durationUnits];
  return { start: new Date(end.getTime() - Number(match[1]) * unit), end };
};

/** What a read could not cover, so a short count is not taken for a complete one. */
const coverageWarnings = (
  what: string,
  { skipped, truncated }: Pick<ReadResult<unknown>, "skipped" | "truncated">,
): string[] => [
  ...(skipped > 0 ? [`Skipped ${skipped} unreadable ${what}.`] : []),
  ...(truncated
    ? [
        `Reached the limit on ${what}, so older ones in the window are missing; narrow --since.`,
      ]
    : []),
];

const print = (json: object, markdown: string, warnings: readonly string[]) => {
  for (const warning of warnings) process.stderr.write(`${warning}\n`);
  process.stdout.write(
    values.json
      ? `${JSON.stringify({ ...json, warnings }, null, 2)}\n`
      : `${markdown}\n`,
  );
};

const printList = (
  chronologies: readonly LoggedSubmissionChronology[],
  idleTimeouts: readonly LoggedIdleTimeout[],
  warnings: readonly string[],
) => {
  const summaries = chronologies.map((chronology) =>
    summarizeSubmission(chronology, idleTimeouts),
  );
  print(
    { submissions: summaries, chronologies, idleTimeouts },
    renderSubmissionList(summaries),
    warnings,
  );
};

const printDetail = (detail: SubmissionDetail, warnings: readonly string[]) => {
  print(detail, renderSubmissionDetail(detail), warnings);
};

if (values.log !== undefined) {
  const parsed = parseBrunchLog(
    values.log === "-"
      ? await text(process.stdin)
      : await readFile(values.log, "utf8"),
  );
  const warnings = [
    ...coverageWarnings("chronology lines", {
      skipped: parsed.skipped.chronologyLines,
      truncated: false,
    }),
    ...coverageWarnings("idle-timeout lines", {
      skipped: parsed.skipped.idleTimeoutLines,
      truncated: false,
    }),
  ];
  if (values.submission === undefined) {
    printList([...parsed.chronologies.values()], parsed.idleTimeouts, warnings);
  } else {
    const submissionId = values.submission;
    const chronology = parsed.chronologies.get(submissionId) ?? null;
    printDetail(
      {
        submissionId,
        searched: `in ${values.log === "-" ? "stdin" : values.log}`,
        chronology,
        idleTimeouts: idleTimeoutsOf(
          submissionId,
          chronology,
          parsed.idleTimeouts,
        ),
        spans: null,
      },
      warnings,
    );
  }
} else {
  const since =
    values.since ?? (values.submission === undefined ? "1h" : "24h");
  const window = windowEndingNow(since);
  try {
    const reader = createGrafanaReader({
      url: values.grafana,
      token: process.env.GRAFANA_TOKEN,
      service: values.service,
    });
    if (values.submission === undefined) {
      const [chronologies, idleTimeouts] = await Promise.all([
        reader.chronologies(window),
        reader.idleTimeouts(window),
      ]);
      printList(chronologies.records, idleTimeouts.records, [
        ...coverageWarnings("chronology lines", chronologies),
        ...coverageWarnings("idle-timeout lines", idleTimeouts),
      ]);
    } else {
      const submissionId = values.submission;
      const [chronologies, idleTimeouts, spans] = await Promise.all([
        reader.chronologies(window, submissionId),
        reader.idleTimeouts(window),
        reader.modelCallSpans(window, submissionId),
      ]);
      const chronology = chronologies.records[0] ?? null;
      printDetail(
        {
          submissionId,
          searched: `in the last ${since}`,
          chronology,
          idleTimeouts: idleTimeoutsOf(
            submissionId,
            chronology,
            idleTimeouts.records,
          ),
          spans: spans.records,
        },
        [
          ...coverageWarnings("chronology lines", chronologies),
          ...coverageWarnings("idle-timeout lines", idleTimeouts),
          ...coverageWarnings("traces", spans),
        ],
      );
    }
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `Could not read telemetry from Grafana at ${values.grafana}: ${cause}\n` +
        "Start the local stack (yarn compose up), pass --grafana with GRAFANA_TOKEN, or read a log with --log.\n",
    );
    process.exit(1);
  }
}
