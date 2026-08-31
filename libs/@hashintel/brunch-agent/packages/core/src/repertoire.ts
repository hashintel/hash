/**
 * The repertoire's shape: the harness's own filling of every guidance and
 * runbook key (ADR-0007 decisions 3, 7, 8).
 *
 * The repertoire is shipped by `packages/repertoire`, which depends only on
 * this package; this module is the type and the reader, so that the harness
 * can define what a repertoire must be without importing one. Two rules the
 * reader enforces that a plugin definition does not: every key is filled, and
 * every entry names its source — admission is by evidence, not plausibility.
 */

import * as v from "valibot";

import { GUIDANCE_KEYS, JOBS, MOVEMENTS, RUNBOOK_KEYS, type Job } from "./keys";
import {
  GuidanceCellsSchema,
  PluginDefinitionError,
  readYamlAs,
  RunbookCellsSchema,
  type GuidanceCells,
  type RunbookCells,
} from "./plugin-definition";

export interface Repertoire {
  readonly version: string;
  readonly purpose: string;
  readonly guidance: GuidanceCells;
  readonly runbooks: Readonly<Record<Job, RunbookCells>>;
}

export const RepertoireSchema = v.strictObject({
  repertoire: v.strictObject({
    version: v.pipe(
      v.string(),
      v.regex(/^repertoire\/\d{4}-\d{2}-\d{2}\.\d+$/u),
    ),
    purpose: v.pipe(v.string(), v.nonEmpty()),
  }),
  guidance: GuidanceCellsSchema,
  runbooks: v.strictObject({
    construct: RunbookCellsSchema,
    "review-and-revise": RunbookCellsSchema,
  }),
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
    guidance: input.guidance,
    runbooks: input.runbooks,
  };
}
