/**
 * The repertoire's shape: the harness's own filling of every guidance and
 * runbook key (ADR-0007 decisions 3, 7, 8).
 *
 * The repertoire is shipped from this package's guarded `./prompts` subpath;
 * this module is the type and the reader. Two rules the reader enforces that a
 * plugin definition does not: every key is filled, and every entry names its
 * source — admission is by evidence, not plausibility.
 */

import * as v from "valibot";

import { GUIDANCE_KEYS, JOBS, MOVEMENTS, RUNBOOK_KEYS, type Job } from "./keys";
import {
  PRECISION_WORDS,
  PluginDefinitionError,
  readYamlAs,
  type GuidanceCells,
  type GuidanceItem,
  type RunbookCells,
} from "./plugin-definition";

export interface Repertoire {
  readonly version: string;
  readonly purpose: string;
  readonly guidance: GuidanceCells;
  readonly runbooks: Readonly<Record<Job, RunbookCells>>;
}

const text = v.pipe(v.string(), v.nonEmpty());
const RepertoireItemSchema = v.strictObject({
  name: text,
  text,
  signature: v.optional(text),
  source: v.optional(text),
  for_precision: v.optional(
    v.pipe(v.array(v.picklist(PRECISION_WORDS)), v.minLength(1)),
  ),
});
const items = v.array(RepertoireItemSchema);
const RepertoireGuidanceCellsSchema = v.strictObject({
  lenses: items,
  techniques: items,
  movements: v.strictObject({
    slice: items,
    sweep: items,
  }),
  licenses: items,
  motifs: items,
  smells: items,
  rabbit_holes: items,
  failure_modes: items,
});
const RepertoireRunbookCellsSchema = v.strictObject({
  kickoff: items,
  trajectory: items,
  close: items,
});

export const RepertoireSchema = v.strictObject({
  repertoire: v.strictObject({
    version: v.pipe(
      v.string(),
      v.regex(/^repertoire\/\d{4}-\d{2}-\d{2}\.\d+$/u),
    ),
    purpose: v.pipe(v.string(), v.nonEmpty()),
  }),
  guidance: RepertoireGuidanceCellsSchema,
  runbooks: v.strictObject({
    construct: RepertoireRunbookCellsSchema,
    "review-and-revise": RepertoireRunbookCellsSchema,
  }),
});

type RepertoireItemInput = v.InferOutput<typeof RepertoireItemSchema>;
type RepertoireGuidanceCellsInput = v.InferOutput<
  typeof RepertoireGuidanceCellsSchema
>;
type RepertoireRunbookCellsInput = v.InferOutput<
  typeof RepertoireRunbookCellsSchema
>;

const readItem = (input: RepertoireItemInput): GuidanceItem => ({
  name: input.name,
  text: input.text,
  ...(input.for_precision === undefined
    ? {}
    : { forPrecision: input.for_precision }),
  ...(input.signature === undefined ? {} : { signature: input.signature }),
  ...(input.source === undefined ? {} : { source: input.source }),
});

const readItems = (inputs: readonly RepertoireItemInput[]): GuidanceItem[] =>
  inputs.map(readItem);

const readGuidance = (input: RepertoireGuidanceCellsInput): GuidanceCells => ({
  lenses: readItems(input.lenses),
  techniques: readItems(input.techniques),
  movements: {
    slice: readItems(input.movements.slice),
    sweep: readItems(input.movements.sweep),
  },
  licenses: readItems(input.licenses),
  motifs: readItems(input.motifs),
  smells: readItems(input.smells),
  rabbit_holes: readItems(input.rabbit_holes),
  failure_modes: readItems(input.failure_modes),
});

const readRunbook = (input: RepertoireRunbookCellsInput): RunbookCells => ({
  kickoff: readItems(input.kickoff),
  trajectory: readItems(input.trajectory),
  close: readItems(input.close),
});

const fail = (message: string): never => {
  throw new PluginDefinitionError(message);
};

/** Read `repertoire.yaml`; every key filled, every entry sourced. */
export function readRepertoire(yamlText: string): Repertoire {
  const input = readYamlAs(RepertoireSchema, yamlText, "the repertoire");
  const requireFilled = (
    path: string,
    entries: readonly { readonly source?: string; readonly name: string }[],
  ): void => {
    if (entries.length === 0) {
      fail(
        `the repertoire leaves \`${path}\` empty; the harness must teach every key`,
      );
    }
    for (const entry of entries) {
      if (entry.source === undefined) {
        fail(`repertoire entry \`${path}\` › "${entry.name}" names no source`);
      }
    }
  };
  for (const key of GUIDANCE_KEYS) {
    if (key === "movements") {
      for (const movement of MOVEMENTS) {
        requireFilled(
          `movements.${movement}`,
          input.guidance.movements[movement],
        );
      }
    } else {
      requireFilled(key, input.guidance[key]);
    }
  }
  for (const job of JOBS) {
    for (const key of RUNBOOK_KEYS) {
      requireFilled(`${job}.${key}`, input.runbooks[job][key]);
    }
  }
  return {
    version: input.repertoire.version,
    purpose: input.repertoire.purpose,
    guidance: readGuidance(input.guidance),
    runbooks: {
      construct: readRunbook(input.runbooks.construct),
      "review-and-revise": readRunbook(input.runbooks["review-and-revise"]),
    },
  };
}
