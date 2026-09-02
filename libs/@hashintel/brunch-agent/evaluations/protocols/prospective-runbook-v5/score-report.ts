export type ScoreReportMode = "cold" | "omniscient";

export interface ScoreReportResult {
  readonly computed: number;
  readonly reported: number;
  readonly scores: readonly number[];
  readonly valid: boolean;
}

const sectionFrom = (report: string, heading: string): string => {
  const start = report.indexOf(`## ${heading}`);
  if (start === -1) {
    throw new Error(`Grade report is missing the ${heading} section.`);
  }
  const end = report.indexOf("\n## ", start + heading.length + 3);
  return report.slice(start, end === -1 ? undefined : end);
};

const scoresFrom = (section: string): readonly number[] =>
  section.split("\n").flatMap((line) => {
    const cells = line.split("|").map((cell) => cell.trim());
    const score = Number(cells[2]);
    return Number.isFinite(score) && score >= 0 && score <= 4 ? [score] : [];
  });

const reportedScoreFrom = (mode: ScoreReportMode, report: string): number => {
  const label =
    mode === "omniscient" ? "Weighted total" : "Overall cold utility";
  const match = report.match(
    new RegExp(`${label}:\\s*\\*{0,2}([0-9]+(?:\\.[0-9]+)?)`, "u"),
  );
  if (match?.[1] === undefined) {
    throw new Error(`Grade report is missing its reported ${label}.`);
  }
  return Number(match[1]);
};

const roundToOneDecimal = (value: number): number =>
  Math.round(value * 10) / 10;

export const scoreReport = (
  mode: ScoreReportMode,
  report: string,
): ScoreReportResult => {
  const scores = scoresFrom(
    sectionFrom(report, mode === "omniscient" ? "Score vector" : "Scorecard"),
  );
  if (scores.length !== 6) {
    throw new Error(
      `Grade report must contain exactly six ${mode} scores; found ${scores.length}.`,
    );
  }
  const computed = roundToOneDecimal(
    mode === "omniscient"
      ? scores.reduce(
          (total, score, index) =>
            total + (score / 4) * [20, 20, 20, 15, 15, 10][index]!,
          0,
        )
      : scores.reduce((total, score) => total + score, 0) / scores.length,
  );
  const reported = reportedScoreFrom(mode, report);
  return {
    computed,
    reported,
    scores,
    valid: reported === computed,
  };
};
