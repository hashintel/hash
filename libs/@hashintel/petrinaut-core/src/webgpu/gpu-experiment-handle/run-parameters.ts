/**
 * Turns a run plan into the shader's parameter buffer: the sorted set of
 * overridden identifiers, and one f32 draw per (run, identifier),
 * run-major.
 *
 * Validation refuses what the buffer cannot carry, so the caller reports why
 * instead of computing something else.
 */
import type { ExperimentRunPlan } from "../../experiments/experiment-request";

export type RunParameters = {
  ids: readonly string[];
  /** Run-major draws, `runCount × ids.length`; absent when nothing varies. */
  values?: Float32Array;
};

export type DerivedRunParameters =
  | { ok: true; runParameters: RunParameters }
  | { ok: false; reason: string };

const NONE: RunParameters = { ids: [] };

/**
 * Validates the draws' count and finiteness — before and after narrowing to
 * f32, since a finite f64 past ~3.4e38 narrows to an infinity — and packs
 * them as f32.
 */
const packDraws = (
  ids: readonly string[],
  raw: ArrayLike<number>,
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
    if (!Number.isFinite(value)) {
      return {
        ok: false,
        reason: `Per-run value \`${value}\` for \`${ids[index % ids.length]}\` is not a finite number, which is all the GPU's f32 buffer can carry.`,
      };
    }
    if (!Number.isFinite(Math.fround(value))) {
      return {
        ok: false,
        reason: `Per-run value \`${value}\` for \`${ids[index % ids.length]}\` overflows f32, the widest float WGSL has.`,
      };
    }
    values[index] = value;
  }
  return { ok: true, runParameters: { ids, values } };
};

export const deriveRunParameters = (
  runPlan: ExperimentRunPlan | undefined,
  runCount: number,
): DerivedRunParameters =>
  runPlan === undefined
    ? { ok: true, runParameters: NONE }
    : packDraws(runPlan.ids, runPlan.values, runCount);
