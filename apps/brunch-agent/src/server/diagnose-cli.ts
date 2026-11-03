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
 * `--json` prints the records instead of tables.
 */

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import {
  createGrafanaReader,
  parseBrunchLog,
  renderSubmissionDetail,
  renderSubmissionList,
  summarizeSubmission,
  type LoggedIdleTimeout,
  type LoggedSubmissionChronology,
  type SubmissionDetail,
  type TimeWindow,
} from "./telemetry-readback.ts";

const usage = `usage: diagnose [--submission <id>] [--since <30m|6h|2d>] [--json]
                [--grafana <url>] [--service <name>] [--loki <datasource>] [--tempo <datasource>]
                [--log <file|->]`;

const { values } = parseArgs({
  options: {
    submission: { type: "string" },
    since: { type: "string" },
    json: { type: "boolean", default: false },
    grafana: { type: "string", default: "http://localhost:3001" },
    service: { type: "string", default: "Brunch Agent" },
    loki: { type: "string" },
    tempo: { type: "string" },
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

const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
};

const print = (json: unknown, text: string) => {
  process.stdout.write(
    values.json ? `${JSON.stringify(json, null, 2)}\n` : `${text}\n`,
  );
};

const printList = (
  chronologies: readonly LoggedSubmissionChronology[],
  idleTimeouts: readonly LoggedIdleTimeout[],
) => {
  const summaries = chronologies.map((chronology) =>
    summarizeSubmission(chronology, idleTimeouts),
  );
  print(
    { submissions: summaries, idleTimeouts },
    renderSubmissionList(summaries),
  );
};

const printDetail = (detail: SubmissionDetail) => {
  print(detail, renderSubmissionDetail(detail));
};

if (values.log !== undefined) {
  const parsed = parseBrunchLog(
    values.log === "-" ? await readStdin() : await readFile(values.log, "utf8"),
  );
  if (values.submission === undefined) {
    printList([...parsed.chronologies.values()], parsed.idleTimeouts);
  } else {
    printDetail({
      submissionId: values.submission,
      chronology: parsed.chronologies.get(values.submission) ?? null,
      idleTimeouts: parsed.idleTimeouts.filter(
        (timeout) => timeout.submissionId === values.submission,
      ),
      spans: null,
    });
  }
  const { chronologyLines, idleTimeoutLines } = parsed.skipped;
  if (chronologyLines + idleTimeoutLines > 0) {
    process.stderr.write(
      `Skipped ${chronologyLines} unreadable chronology and ${idleTimeoutLines} idle-timeout lines.\n`,
    );
  }
  process.exit(0);
}

const reader = createGrafanaReader({
  url: values.grafana,
  token: process.env.GRAFANA_TOKEN,
  service: values.service,
  loki: values.loki,
  tempo: values.tempo,
});

try {
  if (values.submission === undefined) {
    const window = windowEndingNow(values.since ?? "1h");
    const [chronologies, idleTimeouts] = await Promise.all([
      reader.chronologies(window),
      reader.idleTimeouts(window),
    ]);
    printList(chronologies, idleTimeouts);
  } else {
    const window = windowEndingNow(values.since ?? "24h");
    const submissionId = values.submission;
    const [chronologies, idleTimeouts, spans] = await Promise.all([
      reader.chronologies(window, submissionId),
      reader.idleTimeouts(window, submissionId),
      reader.modelCallSpans(window, submissionId),
    ]);
    printDetail({
      submissionId,
      chronology: chronologies[0] ?? null,
      idleTimeouts,
      spans,
    });
  }
} catch (error) {
  const cause = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `Could not read telemetry from Grafana at ${values.grafana}: ${cause}\n` +
      "Start the local stack (yarn compose up), pass --grafana with GRAFANA_TOKEN, or read a log with --log.\n",
  );
  process.exit(1);
}
