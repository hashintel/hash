import {
  type ConstraintDraftsState,
  DEFAULT_PASS_THRESHOLD_PERCENT,
} from "./constraint-drafts";
/**
 * From the Constraints section's drafts to what the experiment carries: the
 * pass threshold as a constraint policy, the non-blank rows lowered to HIR
 * through the language worker, and the placeholder specs that let the GPU
 * gate refuse a state constraint before creation.
 */
import { describeConstraint } from "./constraint-lsp";

import type { ExperimentMetricSpecInput } from "../../../../../../../../react/experiments/context";
import type { LanguageClientContextValue } from "../../../../../../../../react/lsp/context";
import type {
  Constraint,
  LowerConstraintContext,
  PetrinautOptimizationConstraintPolicy,
} from "@hashintel/petrinaut-core";

/**
 * The constraint policy for a pass threshold in percent: `alpha` is the
 * share of runs a state constraint may fail, rounded to 1e-5. Undefined at
 * the default 95 and while the field is blank, so the manifest's own default
 * applies.
 */
export const constraintPolicyFor = (
  passThresholdPercent: number | null,
): PetrinautOptimizationConstraintPolicy | undefined =>
  passThresholdPercent === null ||
  passThresholdPercent === DEFAULT_PASS_THRESHOLD_PERCENT
    ? undefined
    : { alpha: Math.round((100 - passThresholdPercent) * 1000) / 100_000 };

/**
 * Lowers every non-blank row, in list order, naming each after its row label
 * so the study's cards, table and manifest print `Parameter constraint 1`
 * rather than an id. Rejects with `<Row label>: <first diagnostic>` for the
 * first row, in list order, that does not compile.
 */
export const lowerConstraintDrafts = async ({
  drafts,
  requestConstraint,
  context,
}: {
  drafts: ConstraintDraftsState;
  requestConstraint: LanguageClientContextValue["requestConstraint"];
  context: LowerConstraintContext;
}): Promise<Constraint[]> => {
  const rows = drafts.rows.filter((row) => row.code.trim() !== "");
  const lowered = await Promise.all(
    rows.map(async (row) => {
      const name = describeConstraint(row, drafts.rows);
      const result = await requestConstraint(
        { space: row.space, id: row.id, name, code: row.code },
        context,
      );
      return { name, result };
    }),
  );
  const constraints: Constraint[] = [];
  for (const { name, result } of lowered) {
    if (!result.ok) {
      throw new Error(
        `${name}: ${result.diagnostics[0]?.message ?? "does not compile"}`,
      );
    }
    constraints.push(result.constraint);
  }
  return constraints;
};

/**
 * One placeholder place-count spec per non-blank state row, aggregated with
 * `min` over time as the row's indicator metric will be. The GPU gate refuses
 * that aggregation before it reads anything else about a metric, so the
 * backend switch greys out with the run-time gate's own sentence before the
 * experiment exists; the indicator itself is compiled at creation. None
 * without a place to count.
 */
export const stateConstraintGateSpecs = (
  drafts: ConstraintDraftsState,
  firstPlaceId: string | undefined,
): ExperimentMetricSpecInput[] =>
  firstPlaceId === undefined
    ? []
    : drafts.rows.flatMap((row) =>
        row.space !== "state" || row.code.trim() === ""
          ? []
          : [
              {
                kind: "placeTokenCountMean" as const,
                id: row.id,
                label: describeConstraint(row, drafts.rows),
                placeId: firstPlaceId,
                aggregateTime: "min" as const,
              },
            ],
      );
