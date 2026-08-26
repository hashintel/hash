/**
 * The plugin definition: `plugin.yaml` read under the harness-owned keys
 * (ADR-0007 decision 8).
 *
 * A plugin is data under fixed keys in four groups — contract (`ontology`,
 * `schema`, `patterns`), guidance, runbooks, machinery — plus an identity block.
 * The schema here is the contract: an unknown key anywhere is rejected, so a
 * plugin can specialise every key and add none. The cross-checks below are the
 * facts a schema cannot state — that every row names a declared kind, that the
 * anchor is a row, that runbooks belong to declared jobs.
 *
 * `schema/plugin.schema.json` is derived from `PluginDefinitionSchema` and
 * published for editors; a test keeps the two identical.
 */

import * as v from "valibot";
import { parse as parseYaml } from "yaml";

import {
  GUIDANCE_KEYS,
  JOBS,
  MOVEMENTS,
  RUNBOOK_KEYS,
  type GuidanceKey,
  type Job,
  type Movement,
  type RunbookKey,
} from "./keys";

/** Precision words, in ladder order except `spelled out`, which is its own ladder. */
export const PRECISION_WORDS = [
  "named",
  "number",
  "range",
  "spread",
  "spelled out",
] as const;
export type PrecisionWord = (typeof PRECISION_WORDS)[number];

/** What a row demands: a precision word, or a count of nodes present. */
export type PrecisionDemand =
  | { readonly kind: "word"; readonly word: PrecisionWord }
  | { readonly kind: "at-least"; readonly count: number };

/** What each precision word means; harness vocabulary, rendered for every plugin. */
export const PRECISION_LADDER: Readonly<
  Record<PrecisionWord | "at least N", string>
> = {
  named: "identified in words",
  number: "a single figure with its unit",
  range: "an ordinary low and high",
  spread:
    'range plus "typical", plus one-in-ten worse and one-in-ten better (or median and quartiles)',
  "spelled out":
    "the rule, pattern, list, or structure itself, in a form a second reader could apply without asking",
  "at least N": "a count of nodes present",
};

export interface KindRow {
  readonly kind: string;
  readonly description: string;
  readonly projectsTo: string;
}

export interface MustKnowRow {
  readonly kind: string;
  readonly slot: string;
  readonly precision: PrecisionDemand;
  readonly notApplicableAllowed: boolean;
  readonly why: string;
}

export interface FloorRow {
  readonly kind: string;
  readonly atLeast: number;
}

export interface PatternRow {
  readonly id: string;
  readonly when: string;
  readonly ask: string;
  /** The kinds whose nodes can trigger it; empty means any node. */
  readonly kinds: readonly string[];
  /** When present, the pattern applies only while this demanded slot fails. */
  readonly slot?: string;
}

/** The completion anchor, declared: the kind whose dependency slot is the slice. */
export interface Anchor {
  readonly kind: string;
  readonly dependencySlot: string;
}

/** One entry in a guidance or runbook cell. */
export interface GuidanceItem {
  readonly name: string;
  readonly text: string;
  /** For failure modes: how the failure is detected. */
  readonly signature?: string;
  /** Where the entry comes from; required of the repertoire, optional for a plugin. */
  readonly source?: string;
}

export interface MovementCells {
  readonly slice: readonly GuidanceItem[];
  readonly sweep: readonly GuidanceItem[];
}

export type GuidanceCells = {
  readonly [K in Exclude<GuidanceKey, "movements">]: readonly GuidanceItem[];
} & { readonly movements: MovementCells };

export type RunbookCells = {
  readonly [K in RunbookKey]: readonly GuidanceItem[];
};

export interface NamedText {
  readonly name: string;
  readonly text: string;
}

export interface AttributeNote extends NamedText {
  readonly on: string;
  readonly values?: readonly string[];
}

export interface ProposalDeclaration {
  readonly type: string;
  readonly payload: string;
}

/** The read model of one `plugin.yaml`. */
export interface PluginDefinition {
  readonly version: string;
  readonly identity: {
    readonly id: string;
    readonly formalism: string;
    readonly jobs: readonly Job[];
    readonly purpose: string;
  };
  readonly kinds: readonly KindRow[];
  readonly ontology: {
    readonly preamble?: string;
    readonly notKinds: readonly NamedText[];
    readonly attributes: readonly AttributeNote[];
  };
  readonly anchor: Anchor;
  readonly floor: readonly FloorRow[];
  readonly mustKnow: readonly MustKnowRow[];
  readonly proposals: readonly ProposalDeclaration[];
  readonly schemaPreamble?: string;
  readonly patterns: readonly PatternRow[];
  readonly patternsPreamble?: string;
  readonly guidance: GuidanceCells;
  readonly runbooks: Partial<Record<Job, RunbookCells>>;
  readonly machinery: {
    readonly checks: readonly string[];
    readonly tools: readonly string[];
  };
}

export class PluginDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginDefinitionError";
  }
}

// ── The schema ──────────────────────────────────────────────────────────────

const text = v.pipe(v.string(), v.nonEmpty());
const identifier = v.pipe(v.string(), v.regex(/^[a-z][a-z0-9-]*$/u));
const version = v.pipe(
  v.string(),
  v.regex(
    /^[a-z][a-z0-9-]*\/\d{4}-\d{2}-\d{2}\.\d+$/u,
    "expected `<id>/<yyyy-mm-dd>.<n>`",
  ),
);
const precision = v.union([
  v.picklist(PRECISION_WORDS),
  v.pipe(v.string(), v.regex(/^at least [1-9]\d*$/u)),
]);

export const GuidanceItemSchema = v.strictObject({
  name: text,
  text,
  signature: v.optional(text),
  source: v.optional(text),
});
const items = v.array(GuidanceItemSchema);

export const GuidanceCellsSchema = v.strictObject({
  lenses: items,
  techniques: items,
  movements: v.strictObject({ slice: items, sweep: items }),
  licenses: items,
  motifs: items,
  smells: items,
  rabbit_holes: items,
  failure_modes: items,
});

export const RunbookCellsSchema = v.strictObject({
  kickoff: items,
  trajectory: items,
  close: items,
});

const namedText = v.strictObject({ name: text, text });

export const PluginDefinitionSchema = v.strictObject({
  plugin: v.strictObject({
    id: identifier,
    version,
    formalism: text,
    jobs: v.pipe(v.array(v.picklist(JOBS)), v.minLength(1)),
    purpose: text,
  }),
  ontology: v.strictObject({
    preamble: v.optional(text),
    kinds: v.pipe(
      v.array(v.strictObject({ kind: text, is: text, projects_to: text })),
      v.minLength(1),
    ),
    not_kinds: v.optional(v.array(namedText)),
    attributes: v.optional(
      v.array(
        v.strictObject({
          name: text,
          on: text,
          values: v.optional(v.array(text)),
          text,
        }),
      ),
    ),
  }),
  schema: v.strictObject({
    preamble: v.optional(text),
    anchor: v.strictObject({ kind: text, depends_on: text }),
    floor: v.array(
      v.strictObject({
        kind: text,
        at_least: v.pipe(v.number(), v.integer(), v.minValue(1)),
      }),
    ),
    must_know: v.pipe(
      v.array(
        v.strictObject({
          kind: text,
          slot: text,
          precision,
          not_applicable: v.boolean(),
          why: text,
        }),
      ),
      v.minLength(1),
    ),
    proposals: v.pipe(
      v.array(v.strictObject({ type: identifier, payload: identifier })),
      v.minLength(1),
    ),
  }),
  patterns: v.strictObject({
    preamble: v.optional(text),
    items: v.array(
      v.strictObject({
        id: v.pipe(v.string(), v.regex(/^P\d{2}$/u)),
        on: v.array(text),
        slot: v.optional(text),
        when: text,
        ask: text,
      }),
    ),
  }),
  guidance: GuidanceCellsSchema,
  runbooks: v.strictObject({
    construct: v.optional(RunbookCellsSchema),
    "review-and-revise": v.optional(RunbookCellsSchema),
  }),
  machinery: v.strictObject({
    checks: v.array(identifier),
    tools: v.array(identifier),
  }),
});

export type PluginDefinitionInput = v.InferInput<typeof PluginDefinitionSchema>;

// ── The reader ──────────────────────────────────────────────────────────────

const parsePrecision = (word: string): PrecisionDemand => {
  const atLeast = /^at least (\d+)$/u.exec(word);
  if (atLeast?.[1] !== undefined) {
    return { kind: "at-least", count: Number(atLeast[1]) };
  }
  return { kind: "word", word: word as PrecisionWord };
};

const fail = (message: string): never => {
  throw new PluginDefinitionError(message);
};

const formatIssues = (issues: readonly v.BaseIssue<unknown>[]): string =>
  issues
    .map((issue) => {
      const path = (issue.path ?? [])
        .map((segment) => String(segment.key))
        .join(".");
      return `${path || "<root>"}: ${issue.message}`;
    })
    .join("; ");

/** Parse and validate a YAML document as an object of the given schema. */
export const readYamlAs = <T extends v.GenericSchema>(
  schema: T,
  yamlText: string,
  what: string,
): v.InferOutput<T> => {
  let document: unknown;
  try {
    document = parseYaml(yamlText);
  } catch (error) {
    return fail(`${what} is not valid YAML: ${String(error)}`);
  }
  const result = v.safeParse(schema, document);
  if (!result.success) {
    return fail(
      `${what} does not match its schema — ${formatIssues(result.issues)}`,
    );
  }
  return result.output;
};

/**
 * Read one `plugin.yaml`. Fails loudly, at load, on a schema violation or a
 * cross-reference the schema cannot express.
 */
export function readPluginDefinition(yamlText: string): PluginDefinition {
  const input = readYamlAs(
    PluginDefinitionSchema,
    yamlText,
    "the plugin definition",
  );

  const kindNames = input.ontology.kinds.map((row) => row.kind);
  const kinds = new Set(kindNames);
  if (kinds.size !== kindNames.length) {
    fail("`ontology.kinds` repeats a kind");
  }
  const knownKind = (kind: string, where: string): void => {
    if (!kinds.has(kind)) {
      fail(
        `${where} names kind \`${kind}\`, which is not in \`ontology.kinds\``,
      );
    }
  };

  const mustKnow: MustKnowRow[] = input.schema.must_know.map((row) => {
    knownKind(row.kind, "`schema.must_know`");
    return {
      kind: row.kind,
      slot: row.slot,
      precision: parsePrecision(row.precision),
      notApplicableAllowed: row.not_applicable,
      why: row.why,
    };
  });
  for (const kind of kindNames) {
    if (!mustKnow.some((row) => row.kind === kind)) {
      fail(`\`schema.must_know\` has no row for kind \`${kind}\``);
    }
  }

  const floor: FloorRow[] = input.schema.floor.map((row) => {
    knownKind(row.kind, "`schema.floor`");
    return { kind: row.kind, atLeast: row.at_least };
  });
  if (new Set(floor.map((row) => row.kind)).size !== floor.length) {
    fail("`schema.floor` repeats a kind");
  }

  const { anchor } = input.schema;
  knownKind(anchor.kind, "`schema.anchor`");
  const anchorRow = mustKnow.find(
    (row) => row.kind === anchor.kind && row.slot === anchor.depends_on,
  );
  if (anchorRow === undefined) {
    fail(
      `\`schema.anchor\` names slot \`${anchor.depends_on}\` on \`${anchor.kind}\`, which is not a \`must_know\` row`,
    );
  } else if (anchorRow.precision.kind !== "at-least") {
    fail("the anchor's dependency slot must demand `at least N`");
  }

  const patternIds = input.patterns.items.map((row) => row.id);
  if (new Set(patternIds).size !== patternIds.length) {
    fail("`patterns.items` repeats an id");
  }
  const patterns: PatternRow[] = input.patterns.items.map((row) => {
    for (const kind of row.on) knownKind(kind, `pattern ${row.id}`);
    if (row.slot !== undefined) {
      if (
        row.on.length === 0 &&
        !mustKnow.some((demand) => demand.slot === row.slot)
      ) {
        fail(
          `pattern ${row.id} names slot \`${row.slot}\`, which no kind demands`,
        );
      }
      const kindWithoutSlot = row.on.find(
        (kind) =>
          !mustKnow.some(
            (demand) => demand.kind === kind && demand.slot === row.slot,
          ),
      );
      if (kindWithoutSlot !== undefined) {
        fail(
          `pattern ${row.id} names slot \`${row.slot}\`, which \`${kindWithoutSlot}\` does not demand`,
        );
      }
    }
    return {
      id: row.id,
      when: row.when,
      ask: row.ask,
      kinds: row.on,
      ...(row.slot === undefined ? {} : { slot: row.slot }),
    };
  });

  const jobs = input.plugin.jobs;
  if (new Set(jobs).size !== jobs.length) fail("`plugin.jobs` repeats a job");
  const runbooks: Partial<Record<Job, RunbookCells>> = {};
  for (const job of JOBS) {
    const cells = input.runbooks[job];
    if (cells === undefined) continue;
    if (!jobs.includes(job)) {
      fail(
        `\`runbooks.${job}\` is present but \`plugin.jobs\` does not declare it`,
      );
    }
    runbooks[job] = cells;
  }

  return {
    version: input.plugin.version,
    identity: {
      id: input.plugin.id,
      formalism: input.plugin.formalism,
      jobs,
      purpose: input.plugin.purpose,
    },
    kinds: input.ontology.kinds.map((row) => ({
      kind: row.kind,
      description: row.is,
      projectsTo: row.projects_to,
    })),
    ontology: {
      ...(input.ontology.preamble === undefined
        ? {}
        : { preamble: input.ontology.preamble }),
      notKinds: input.ontology.not_kinds ?? [],
      attributes: input.ontology.attributes ?? [],
    },
    anchor: { kind: anchor.kind, dependencySlot: anchor.depends_on },
    floor,
    mustKnow,
    proposals: input.schema.proposals,
    ...(input.schema.preamble === undefined
      ? {}
      : { schemaPreamble: input.schema.preamble }),
    patterns,
    ...(input.patterns.preamble === undefined
      ? {}
      : { patternsPreamble: input.patterns.preamble }),
    guidance: input.guidance,
    runbooks,
    machinery: input.machinery,
  };
}

export const mustKnowRowsFor = (
  definition: PluginDefinition,
  kind: string,
): readonly MustKnowRow[] =>
  definition.mustKnow.filter((row) => row.kind === kind);

/** Every guidance cell of a definition, flattened with its key path — for gates. */
export const guidanceEntries = (
  cells: GuidanceCells,
): readonly { readonly path: string; readonly item: GuidanceItem }[] =>
  GUIDANCE_KEYS.flatMap((key) =>
    key === "movements"
      ? MOVEMENTS.flatMap((movement: Movement) =>
          cells.movements[movement].map((item) => ({
            path: `movements.${movement}`,
            item,
          })),
        )
      : cells[key].map((item) => ({ path: key, item })),
  );

/** Every runbook cell of one job, flattened with its key path — for gates. */
export const runbookEntries = (
  runbooks: Partial<Record<Job, RunbookCells>>,
): readonly { readonly path: string; readonly item: GuidanceItem }[] =>
  JOBS.flatMap((job) => {
    const cells = runbooks[job];
    return cells === undefined
      ? []
      : RUNBOOK_KEYS.flatMap((key) =>
          cells[key].map((item) => ({ path: `${job}.${key}`, item })),
        );
  });
