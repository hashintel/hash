import type { LedgerCoverage } from "./map.ts";
import type { LedgerExpectation } from "./vocabulary.ts";

/** How coverage reads in a commit receipt and in the map. */
export interface LedgerCoverageRenderer {
  /** The `coverage` a recorded commit returns. */
  readonly receipt: (coverage: LedgerCoverage) => string;
  /** The map's coverage section, from its leading blank line; empty to omit. */
  readonly map: (coverage: LedgerCoverage) => readonly string[];
}

const receiptNeeds = 5;

interface NearestGoal {
  readonly goal: string;
  readonly steps: number;
}

interface RankedNeed {
  readonly identity: string;
  readonly kind: string;
  readonly need: LedgerExpectation;
  readonly pencilled: boolean;
  readonly nearest?: NearestGoal;
}

/** Each identity's nearest goal over the relationships, in either direction. */
const nearestGoals = ({
  identities,
  relationships,
}: LedgerCoverage): Map<string, NearestGoal> => {
  const neighbours = new Map<string, string[]>();
  for (const { from, to, stage } of relationships) {
    if (stage === "inapplicable") continue;
    neighbours.set(from, [...(neighbours.get(from) ?? []), to]);
    neighbours.set(to, [...(neighbours.get(to) ?? []), from]);
  }
  const nearest = new Map<string, NearestGoal>();
  let frontier = identities
    .filter(({ kind }) => kind === "goal")
    .map(({ identity }) => ({ identity, goal: identity }));
  for (const { identity, goal } of frontier)
    nearest.set(identity, { goal, steps: 0 });
  for (let steps = 1; frontier.length > 0; steps++)
    frontier = frontier.flatMap(({ identity, goal }) =>
      (neighbours.get(identity) ?? [])
        .filter((neighbour) => !nearest.has(neighbour))
        .map((neighbour) => {
          nearest.set(neighbour, { goal, steps });
          return { identity: neighbour, goal };
        }),
    );
  return nearest;
};

/** Nearest a goal first, then missing before pencilled, then Ledger order. */
const rankedNeeds = (coverage: LedgerCoverage): RankedNeed[] => {
  const nearest = nearestGoals(coverage);
  const order = new Map(
    coverage.identities.map(({ identity }, index) => [identity, index]),
  );
  const steps = (ranked: RankedNeed) =>
    ranked.nearest?.steps ?? Number.POSITIVE_INFINITY;
  return (coverage.needs ?? [])
    .flatMap(({ identity, kind, unmet }) =>
      unmet.map(({ need, state }) => {
        const goal = nearest.get(identity);
        return {
          identity,
          kind,
          need,
          pencilled: state === "pencilled",
          ...(goal === undefined ? {} : { nearest: goal }),
        };
      }),
    )
    .sort(
      (left, right) =>
        steps(left) - steps(right) ||
        Number(left.pencilled) - Number(right.pencilled) ||
        (order.get(left.identity) ?? 0) - (order.get(right.identity) ?? 0),
    );
};

const where = ({ nearest }: RankedNeed) =>
  nearest === undefined
    ? ", not connected to a goal"
    : nearest.steps === 0
      ? ""
      : `, ${nearest.steps} step${nearest.steps === 1 ? "" : "s"} from \`${nearest.goal}\``;

const needLine = (ranked: RankedNeed, index: number) =>
  `${index + 1}. \`${ranked.identity}\` [${ranked.kind}]${where(ranked)}: ${ranked.need.name}${ranked.pencilled ? " (pencilled)" : ""} — ${ranked.need.description}`;

const needsLines = (
  coverage: LedgerCoverage,
  limit: number | undefined,
): string[] => {
  if (coverage.needs === undefined) return [];
  const ranked = rankedNeeds(coverage);
  if (ranked.length === 0)
    return ["Every identity with a kind has what its kind needs."];
  const shown = ranked.slice(0, limit);
  const hidden = ranked.slice(shown.length);
  const hiddenIdentities = new Set(hidden.map(({ identity }) => identity)).size;
  const order = coverage.identities.some(({ kind }) => kind === "goal")
    ? "nearest a goal first"
    : "no goal identified yet, so in Ledger order";
  return [
    `Missing needs, ${order}${hidden.length > 0 ? ` (${shown.length} of ${ranked.length})` : ""}:`,
    ...shown.map(needLine),
    ...(hidden.length > 0
      ? [
          `${hidden.length} more across ${hiddenIdentities} ${hiddenIdentities === 1 ? "identity" : "identities"}; ledger_compile lists them all.`,
        ]
      : []),
  ];
};

const coverageLines = (
  coverage: LedgerCoverage,
  limit: number | undefined,
): string[] => [
  ...coverage.dimensions.map(
    ({ name, done, stages, complete }) =>
      `- ${name}: ${stages.length > 0 ? stages.map(({ stage, count }) => `${count} ${stage}`).join(", ") : "nothing recorded"}${complete || done === undefined ? "" : `; nothing confirmed — done when ${done}`}`,
  ),
  ...(coverage.placeholders.length > 0
    ? [
        `- Placeholders: ${coverage.placeholders.map((identity) => `\`${identity}\``).join(", ")}.`,
      ]
    : []),
  ...needsLines(coverage, limit),
];

/**
 * By dimension, how many current Notes, not counting those on the draft, name
 * it at each stage, with each incomplete dimension's done criterion; then the
 * missing needs, nearest a goal over the relationships first. The receipt
 * shows the first five and counts the rest; the map shows them all.
 */
export const renderCoverage: LedgerCoverageRenderer = {
  receipt: (coverage) =>
    [
      "Coverage by dimension (current Notes, not those on the draft):",
      ...coverageLines(coverage, receiptNeeds),
    ].join("\n"),
  map: (coverage) => {
    const lines = coverageLines(coverage, undefined);
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
