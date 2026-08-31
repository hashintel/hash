/**
 * Rendering the interviewer's instructions from the repertoire and a plugin
 * definition (ADR-0007 decision 1): key by key, the key's definition, then the
 * harness default, then the plugin's cell if it is not blank.
 *
 * The fixed harness preamble states what the harness itself enforces —
 * completion, the sweep list, the assumption ledger, the affected slice — so
 * that no plugin cell has to. Everything else the interviewer reads about the
 * formalism comes from the definition's contract keys, rendered as text here
 * because the model reads text; the same data parameterises the fold and the
 * completion evaluation elsewhere.
 */

import {
  GUIDANCE_KEY_DESCRIPTIONS,
  GUIDANCE_KEYS,
  JOB_TITLES,
  MOVEMENTS,
  RUNBOOK_KEY_DESCRIPTIONS,
  RUNBOOK_KEYS,
  type Job,
} from "../plugin/keys";
import {
  formatPrecisionDemand,
  PRECISION_LADDER,
  type GuidanceItem,
  type PluginDefinition,
  type PrecisionWord,
} from "../plugin/plugin-definition";
import { type Repertoire } from "./repertoire";

/**
 * What the harness enforces, stated once. These are facts about mechanism the
 * interviewer must know and no plugin may restate.
 */
export const HARNESS_PREAMBLE: readonly string[] = [
  "The harness keeps the model, not you. Every value it holds comes from a capture you made from the expert's words; you never edit the model, you add captures, and a later capture supersedes an earlier one.",
  "After each applied sweep the harness folds the active captures into the model and reports which demanded slots are unsatisfied and why, with the patterns whose trigger may apply. Read it as a map of what is still unknown, not as an instruction to ask.",
  "A slot is satisfied only by what the expert said or confirmed, at the precision the row demands. Never state a value the expert did not give; record what you would assume in the assumption ledger and ask.",
  "Completion is computed from the model by the harness — the floor, then every node in the dependency slice of every active anchor. Whether the session may stop is the harness's decision; yours is to say what the model can now support and what it cannot.",
  "For the review-and-revise job the harness computes the affected slice — the node, its slots, every anchor whose slice contains it, and what those project to — and nothing outside it changes.",
];

const renderItems = (items: readonly GuidanceItem[]): string[] =>
  items.map((item) => {
    const signature =
      item.signature === undefined ? "" : ` _Signature:_ ${item.signature}`;
    return `- **${item.name}** — ${item.text.trim()}${signature}`;
  });

const demandedPrecisions = (
  definition: PluginDefinition,
): ReadonlySet<PrecisionWord> => {
  const words = new Set<PrecisionWord>();
  for (const row of definition.mustKnow) {
    if (row.precision.kind === "word") {
      words.add(row.precision.word);
    } else if (row.precision.kind === "any-of") {
      for (const word of row.precision.words) {
        words.add(word);
      }
    }
  }
  return words;
};

const applicableRepertoireItems = (
  items: readonly GuidanceItem[],
  precisions: ReadonlySet<PrecisionWord>,
): GuidanceItem[] =>
  items.filter(
    (item) =>
      item.forPrecision === undefined ||
      item.forPrecision.some((precision) => precisions.has(precision)),
  );

const paragraphs = (...parts: (string | undefined)[]): string[] =>
  parts.flatMap((part) =>
    part === undefined || part.trim() === "" ? [] : [part.trim()],
  );

/** The contract keys as text: purpose, kinds, rows, floor, anchor, patterns. */
export const renderContract = (definition: PluginDefinition): string[] => {
  const kinds = definition.kinds.map(
    (row) =>
      `- \`${row.kind}\` — ${row.description.trim()} _Projects to:_ ${row.projectsTo}.`,
  );
  const notKinds = definition.ontology.notKinds.map(
    (entry) => `- **${entry.name}** — ${entry.text.trim()}`,
  );
  const attributes = definition.ontology.attributes.map((entry) => {
    const values =
      entry.values === undefined
        ? ""
        : ` (${entry.values.map((value) => `\`${value}\``).join(" | ")})`;
    return `- **${entry.name}**${values}, on ${entry.on} — ${entry.text.trim()}`;
  });
  const rows = definition.kinds.map((kindRow) => {
    const own = definition.mustKnow
      .filter((row) => row.kind === kindRow.kind)
      .map(
        (row) =>
          `  - ${row.slot} — ${formatPrecisionDemand(row.precision)}${row.notApplicableAllowed ? '; "not applicable" is accepted' : ""}. _Why:_ ${row.why}`,
      );
    return [`- \`${kindRow.kind}\``, ...own].join("\n");
  });
  const floor = definition.floor
    .map((row) => `${row.atLeast} \`${row.kind}\``)
    .join(", ");
  const ladder = Object.entries(PRECISION_LADDER).map(
    ([word, meaning]) => `- \`${word}\` — ${meaning}`,
  );
  const patterns = definition.patterns.map(
    (row) =>
      `- **${row.id}** — _when_ ${row.when.trim()} — _ask_ ${row.ask.trim()}`,
  );
  return [
    `## Purpose\n\n${definition.identity.purpose.trim()}`,
    [
      "## Kinds",
      ...paragraphs(definition.ontology.preamble),
      kinds.join("\n"),
      ...(notKinds.length === 0
        ? []
        : [
            `Things that look like kinds and are not:\n\n${notKinds.join("\n")}`,
          ]),
      ...(attributes.length === 0
        ? []
        : [`Attributes on every kind:\n\n${attributes.join("\n")}`]),
    ].join("\n\n"),
    [
      "## Must know",
      ...paragraphs(definition.schemaPreamble),
      rows.join("\n"),
      `Static floor — before anything \`${definition.anchor.kind}\`-relative counts, the model must contain at least ${floor}. Presence is a count; the floor assigns no precision.`,
      `Anchor — completion is relative to \`${definition.anchor.kind}\` nodes: the model is complete when the floor holds and every node named in each active anchor's "${definition.anchor.dependencySlot}" satisfies its kind's rows. Nodes outside every slice are recorded, not demanded.`,
      `Precision words:\n\n${ladder.join("\n")}\n\nPrecision says how much a value narrows what it could mean, not where it came from; an honest value at the wrong precision and an invented value at the right one are tracked separately and neither substitutes for the other.`,
    ].join("\n\n"),
    ...(definition.patterns.length === 0
      ? []
      : [
          [
            "## Patterns",
            ...paragraphs(definition.patternsPreamble),
            patterns.join("\n"),
          ].join("\n\n"),
        ]),
  ];
};

/** The guidance keys, interleaved: definition, repertoire default, plugin cell. */
export const renderGuidance = (
  repertoire: Repertoire,
  definition: PluginDefinition,
): string[] => {
  const precisions = demandedPrecisions(definition);
  return GUIDANCE_KEYS.map((key) => {
    const description = GUIDANCE_KEY_DESCRIPTIONS[key];
    const body =
      key === "movements"
        ? MOVEMENTS.flatMap((movement) => [
            `### ${movement === "slice" ? "Slice" : "Sweep"}`,
            [
              ...renderItems(
                applicableRepertoireItems(
                  repertoire.guidance.movements[movement],
                  precisions,
                ),
              ),
              ...renderItems(definition.guidance.movements[movement]),
            ].join("\n"),
          ])
        : [
            [
              ...renderItems(
                applicableRepertoireItems(repertoire.guidance[key], precisions),
              ),
              ...renderItems(definition.guidance[key]),
            ].join("\n"),
          ];
    return [`## ${description.title}`, `_${description.definition}_`, ...body]
      .filter((part) => part !== "")
      .join("\n\n");
  });
};

/** One job's runbook: each runbook key's definition, default, and plugin cell. */
export const renderRunbook = (
  repertoire: Repertoire,
  definition: PluginDefinition,
  job: Job,
): string => {
  const cells = definition.runbooks[job];
  const precisions = demandedPrecisions(definition);
  const sections = RUNBOOK_KEYS.map((key) => {
    const description = RUNBOOK_KEY_DESCRIPTIONS[key];
    return [
      `### ${description.title}`,
      `_${description.definition}_`,
      [
        ...renderItems(
          applicableRepertoireItems(repertoire.runbooks[job][key], precisions),
        ),
        ...renderItems(cells?.[key] ?? []),
      ].join("\n"),
    ].join("\n\n");
  });
  return [`## ${JOB_TITLES[job]}`, ...sections].join("\n\n");
};

/**
 * The whole instruction text for one plugin under one repertoire, in contract
 * order: harness preamble, contract, guidance, one runbook per supported job.
 */
export const renderInstructions = (
  repertoire: Repertoire,
  definition: PluginDefinition,
): string =>
  [
    `## What the harness enforces\n\n${HARNESS_PREAMBLE.join("\n\n")}`,
    ...renderContract(definition),
    ...renderGuidance(repertoire, definition),
    ...definition.identity.jobs.map((job) =>
      renderRunbook(repertoire, definition, job),
    ),
  ].join("\n\n");
