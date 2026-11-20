import {
  chronologyMarker,
  idleTimeoutMarker,
  outputLimitMarker,
  toChronology,
  toIdleTimeout,
  toOutputLimit,
  type LoggedIdleTimeout,
  type LoggedOutputLimit,
  type LoggedSubmissionChronology,
} from "./shared/records.ts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The JSON object logged after `marker`, or undefined when the line has none that parses. */
const fieldsAfter = (
  line: string,
  marker: string,
): Record<string, unknown> | undefined => {
  const markerAt = line.indexOf(`${marker} `);
  if (markerAt === -1) return undefined;
  try {
    const fields: unknown = JSON.parse(
      line.slice(markerAt + marker.length + 1),
    );
    return isRecord(fields) ? fields : undefined;
  } catch {
    return undefined;
  }
};

export type ParsedBrunchLog = {
  readonly chronologies: ReadonlyMap<string, LoggedSubmissionChronology>;
  readonly idleTimeouts: readonly LoggedIdleTimeout[];
  readonly outputLimits: readonly LoggedOutputLimit[];
  /** Marked lines that could not be read, by kind. */
  readonly skipped: {
    readonly chronologyLines: number;
    readonly idleTimeoutLines: number;
    readonly outputLimitLines: number;
  };
};

/**
 * The chronology, idle-timeout and output-limit lines in Brunch log text:
 * development console output (winston's colour codes before the marker) or
 * production stdout, where the logged fields follow the message as one JSON
 * object.
 */
export const parseBrunchLog = (log: string): ParsedBrunchLog => {
  const chronologies = new Map<string, LoggedSubmissionChronology>();
  const idleTimeouts: LoggedIdleTimeout[] = [];
  const outputLimits: LoggedOutputLimit[] = [];
  let chronologyLines = 0;
  let idleTimeoutLines = 0;
  let outputLimitLines = 0;
  for (const line of log.split("\n")) {
    if (line.includes(chronologyMarker)) {
      const fields = fieldsAfter(line, chronologyMarker);
      const chronology = fields && toChronology(fields, null);
      if (chronology) chronologies.set(chronology.submissionId, chronology);
      else chronologyLines += 1;
    } else if (line.includes(idleTimeoutMarker)) {
      const fields = fieldsAfter(line, idleTimeoutMarker);
      if (fields) idleTimeouts.push(toIdleTimeout(fields, null));
      else idleTimeoutLines += 1;
    } else if (line.includes(outputLimitMarker)) {
      const fields = fieldsAfter(line, outputLimitMarker);
      if (fields) outputLimits.push(toOutputLimit(fields, null));
      else outputLimitLines += 1;
    }
  }
  return {
    chronologies,
    idleTimeouts,
    outputLimits,
    skipped: { chronologyLines, idleTimeoutLines, outputLimitLines },
  };
};
