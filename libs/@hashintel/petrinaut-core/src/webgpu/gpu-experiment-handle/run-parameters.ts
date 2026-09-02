/**
 * Turns per-run overrides into the shader's parameter buffer: the sorted set
 * of overridden identifiers, and one f32 draw per (run, identifier),
 * run-major.
 *
 * Both forms — a compact run plan, or per-run config records — collect raw
 * draws and then pass through the same validation, which refuses what the
 * buffer cannot carry so the caller reports why instead of computing
 * something else.
 */
import type { ExperimentRunPlan } from "../../experiments/experiment-request";
import type { MonteCarloRunConfig } from "../../simulation/monte-carlo/types";

export type RunParameters = {
  ids: readonly string[];
  /** Run-major draws, `runCount × ids.length`; absent when nothing varies. */
  values?: Float32Array;
};

export type DerivedRunParameters =
  | { ok: true; runParameters: RunParameters }
  | { ok: false; reason: string };

type RawDraws =
  | { ok: true; ids: readonly string[]; values: ArrayLike<number | string> }
  | { ok: false; reason: string };

const NONE: RunParameters = { ids: [] };

const drawsFromRuns = (
  runs: readonly MonteCarloRunConfig[],
  runCount: number,
): RawDraws => {
  if (runs.length !== runCount) {
    return {
      ok: false,
      reason: `The experiment declares ${runCount} runs but supplies ${runs.length} per-run configurations.`,
    };
  }
  // Every run is inspected before any value is read: keying off the first run
  // alone would let a batch whose first run overrides nothing drop every other
  // run's draws.
  const idSet = new Set<string>();
  for (const run of runs) {
    if (run.seed !== undefined || run.initialMarking !== undefined) {
      return {
        ok: false,
        reason:
          "The GPU backend cannot run per-run seed or initial-marking overrides; only per-run parameter values are supported.",
      };
    }
    for (const id of Object.keys(run.parameterValues ?? {})) {
      idSet.add(id);
    }
  }
  const ids = [...idSet].sort();
  const values: (number | string)[] = [];
  for (const run of runs) {
    const overrides = run.parameterValues ?? {};
    if (
      Object.keys(overrides).length !== ids.length ||
      ids.some((id) => overrides[id] === undefined)
    ) {
      return {
        ok: false,
        reason:
          "Every run must override the same parameters for the GPU backend to lay them out in one buffer.",
      };
    }
    for (const id of ids) {
      values.push(overrides[id]!);
    }
  }
  return { ok: true, ids, values };
};

/** Validates the draws' count and finiteness and packs them as f32. */
const packDraws = (
  ids: readonly string[],
  raw: ArrayLike<number | string>,
  runCount: number,
): DerivedRunParameters => {
  if (ids.length === 0) {
    return { ok: true, runParameters: NONE };
  }
  const expected = runCount * ids.length;
  if (raw.length !== expected) {
    return {
      ok: false,
      reason: `The per-run draws carry ${raw.length} values but ${runCount} runs × ${ids.length} parameters needs ${expected}.`,
    };
  }
  const values = new Float32Array(expected);
  for (let index = 0; index < expected; index++) {
    const value = raw[index]!;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return {
        ok: false,
        reason: `Per-run value \`${value}\` for \`${ids[index % ids.length]}\` is not a finite number, which is all the GPU's f32 buffer can carry.`,
      };
    }
    values[index] = parsed;
  }
  return { ok: true, runParameters: { ids, values } };
};

export const deriveRunParameters = (
  runs: readonly MonteCarloRunConfig[] | undefined,
  runPlan: ExperimentRunPlan | undefined,
  runCount: number,
): DerivedRunParameters => {
  if (runPlan !== undefined && runPlan.ids.length > 0) {
    return packDraws(runPlan.ids, runPlan.values, runCount);
  }
  if (runs === undefined || runs.length === 0) {
    return { ok: true, runParameters: NONE };
  }
  const draws = drawsFromRuns(runs, runCount);
  return draws.ok ? packDraws(draws.ids, draws.values, runCount) : draws;
};
