import type { SubmissionChronology } from "../../../src/server/observe-turn-chronology.ts";

type LoggedTurnChronology = Omit<
  SubmissionChronology["turns"][number],
  "startedAt"
> & {
  /** Absent from logs written before turns carried their start time. */
  readonly startedAt?: string;
};

/** A chronology as read back from a server log, which may predate `startedAt`. */
export type LoggedSubmissionChronology = Omit<SubmissionChronology, "turns"> & {
  readonly turns: readonly LoggedTurnChronology[];
};

const chronologyMarker = "[brunch] flue.submission chronology ";

/**
 * The `flue.submission chronology` entries in a Brunch server log, keyed by
 * submission, and how many marked lines could not be read as one. Lines carry
 * winston's colour codes before the marker; the JSON after it is the logged
 * entry.
 */
export const parseChronologyLog = (
  log: string,
): {
  entries: ReadonlyMap<string, LoggedSubmissionChronology>;
  skippedLines: number;
} => {
  const entries = new Map<string, LoggedSubmissionChronology>();
  let skippedLines = 0;
  for (const line of log.split("\n")) {
    const markerAt = line.indexOf(chronologyMarker);
    if (markerAt === -1) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line.slice(markerAt + chronologyMarker.length));
    } catch {
      skippedLines += 1;
      continue;
    }
    if (
      typeof entry === "object" &&
      entry !== null &&
      "submissionId" in entry &&
      typeof entry.submissionId === "string" &&
      "turns" in entry &&
      Array.isArray(entry.turns)
    ) {
      entries.set(entry.submissionId, entry as LoggedSubmissionChronology);
    } else {
      skippedLines += 1;
    }
  }
  return { entries, skippedLines };
};
