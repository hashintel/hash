import type { LedgerCoverage } from "./map.ts";

/** How coverage reads in a commit receipt and in the map. */
export interface LedgerCoverageRenderer {
  /** The `coverage` a recorded commit returns. */
  readonly receipt: (coverage: LedgerCoverage) => string;
  /** The map's coverage section, from its leading blank line; empty to omit. */
  readonly map: (coverage: LedgerCoverage) => readonly string[];
}

const coverageLines = ({
  dimensions,
  placeholders,
  needs,
}: LedgerCoverage): string[] => [
  ...dimensions.map(
    ({ name, done, stages, complete }) =>
      `- ${name}: ${stages.length > 0 ? stages.map(({ stage, count }) => `${count} ${stage}`).join(", ") : "nothing recorded"}${complete || done === undefined ? "" : `; nothing confirmed — done when ${done}`}`,
  ),
  ...(placeholders.length > 0
    ? [
        `- Placeholders: ${placeholders.map((identity) => `\`${identity}\``).join(", ")}.`,
      ]
    : []),
  ...(needs === undefined
    ? []
    : needs.length === 0
      ? ["Every identity with a kind has what its kind needs."]
      : [
          "Identities still missing what their kind needs:",
          ...needs.map(
            ({ identity, kind, unmet }) =>
              `- \`${identity}\` [${kind}]: ${unmet.map(({ need, state }) => (state === "pencilled" ? `${need.name} (pencilled)` : need.name)).join(", ")}`,
          ),
        ]),
];

/**
 * By dimension, how many current Notes, not counting those on the draft, name
 * it at each stage, with each incomplete dimension's done criterion; then
 * each identity still missing what its kind needs.
 */
export const renderCoverage: LedgerCoverageRenderer = {
  receipt: (coverage) =>
    [
      "Coverage by dimension (current Notes, not those on the draft):",
      ...coverageLines(coverage),
    ].join("\n"),
  map: (coverage) => {
    const lines = coverageLines(coverage);
    return lines.length === 0
      ? []
      : [
          "",
          "## Coverage",
          "",
          "Current Notes naming each dimension, not counting those on the draft.",
          "",
          ...lines,
        ];
  },
};
