/**
 * Calibrating what the shader cannot know up front: the slab each
 * derived-capacity place needs, and the histogram window of each metric.
 *
 * Both calibrate the same way — run, look at what the device observed, adjust,
 * run again — so one loop serves the capacity probe and the full attempt. A
 * slab overflow grows the slab (a recompile, capacities are baked); a window
 * escape replans the window (a uniform). Seeds derive from absolute run
 * indices, so a re-run reproduces the same trajectories: a window re-run
 * cannot escape again, and slab growth is monotone.
 */
import { tokenWordCount } from "../eligibility";
import {
  anyEscapes,
  planInitialWindows,
  windowsFromObserved,
} from "../metric-windows";
import { GPU_PREVIEW_RUNS } from "../runner";

import type { GpuBackend, GpuCalibration } from "../backend";
import type { CompiledNetShader } from "../compile-net-shader";
import type { MetricWindow, MetricWindowInput } from "../metric-windows";
import type { GpuExperimentResult } from "../runner";

/**
 * Memory the capacity probe may hold at once: slabs grow geometrically until
 * the runs stop overflowing, and the probe sheds runs to stay inside this
 * budget — few runs afford big slabs, and even eight runs bound a place's
 * maximum well enough for a 1.5×-margin slab with the overflow-grow loop
 * behind it.
 */
export const GPU_PROBE_MEMORY_BYTES = 128 * 1024 * 1024;

/**
 * The largest per-run slab a single derived-capacity place may claim when
 * its probe shows a heavy tail — outlier runs far past the typical maximum.
 * Below it, sizing for the outlier is cheap enough to just do; past it, the
 * right structure is a per-run token arena (shared place-tagged slots sized
 * by the simultaneous total), and until that exists the experiment runs on
 * the CPU, which sizes its buffers dynamically.
 */
export const GPU_ARENA_SLAB_BYTES = 64 * 1024;

/**
 * Margin around a probe's observed range: a prefix of the runs understates
 * the full run's extremes (more runs, wider tails).
 */
export const PROBE_WINDOW_MARGIN = 0.25;

/**
 * Margin around a full attempt's observed range: the re-run reproduces the
 * same trajectories, so the range is exact and only rounding slack is needed.
 */
export const RERUN_WINDOW_MARGIN = 1 / 64;

export type CalibrationPolicy = {
  /** Factor a derived slab grows by after an overflow. */
  slabGrowth: number;
  maxSlabGrowths: number;
  /** How many times a window escape replans the windows before giving up. */
  maxWindowReplans: number;
  /** Whether attempts open with a preview tile. */
  preview: boolean;
};

/**
 * Slabs quadruple per attempt: seven attempts span from the initial guess to
 * counts in the hundreds of thousands. Windows are not replanned here — the
 * probe's observed range seeds them afterwards.
 */
export const PROBE_POLICY: CalibrationPolicy = {
  slabGrowth: 4,
  maxSlabGrowths: 7,
  maxWindowReplans: 0,
  preview: false,
};

/**
 * A full attempt grows conservatively — the probe already sized the slab —
 * and replans its windows once from its own exact observed range.
 */
export const RUN_POLICY: CalibrationPolicy = {
  slabGrowth: 2,
  maxSlabGrowths: 3,
  maxWindowReplans: 1,
  preview: true,
};

/** The shader in force and the derived slabs it was compiled at. */
export type CalibrationSession = {
  backend: Pick<GpuBackend, "recompile" | "profile">;
  shader: CompiledNetShader;
  capacities: Map<string, number>;
};

export type AttemptResult =
  | { ok: true; result: GpuExperimentResult }
  | { ok: false; reason: string };

export type ExecuteAttempt = (attempt: {
  shader: CompiledNetShader;
  runCount: number;
  windows: readonly MetricWindow[];
  preview: boolean;
}) => Promise<AttemptResult>;

export type CalibratedRun =
  | { ok: true; result: GpuExperimentResult; windows: MetricWindow[] }
  | { ok: false; reason: string };

/**
 * Runs the capacity probe executes: a prefix of the experiment, capped by
 * the probe's memory budget at the current slab size, never below eight.
 */
export const probeRunCount = (
  shader: CompiledNetShader,
  runCount: number,
): number => {
  const bytesPerRun = shader.stateWordsPerRun * 4;
  return Math.max(
    Math.min(8, runCount),
    Math.min(
      runCount,
      GPU_PREVIEW_RUNS,
      Math.floor(GPU_PROBE_MEMORY_BYTES / Math.max(1, bytesPerRun)),
    ),
  );
};

/* eslint-disable no-param-reassign -- the session is this module's mutable
   record of the shader in force */
const recompileAt = (
  session: CalibrationSession,
  capacities: ReadonlyMap<string, number>,
  failure: string,
): { ok: true } | { ok: false; reason: string } => {
  const recompiled = session.backend.recompile(capacities);
  if (!recompiled.ok) {
    return { ok: false, reason: `${failure}: ${recompiled.reason}` };
  }
  session.shader = recompiled.shader;
  session.capacities = new Map(capacities);
  return { ok: true };
};
/* eslint-enable no-param-reassign */

const growSlabs = (session: CalibrationSession, factor: number) =>
  recompileAt(
    session,
    new Map(
      [...session.capacities].map(([placeId, capacity]) => [
        placeId,
        capacity * factor,
      ]),
    ),
    "Recompiling at a grown token capacity failed",
  );

/**
 * Runs an attempt until neither a slab overflow nor a window escape remains,
 * or the policy's retry budget runs out. Returns the last attempt's result —
 * a remaining overflow is the caller's to report — with the windows it ran at.
 */
export const runUntilCalibrated = async (options: {
  session: CalibrationSession;
  /** Runs per attempt, given the shader in force (a probe sheds runs as slabs grow). */
  runsFor: (shader: CompiledNetShader) => number;
  windows: readonly MetricWindow[];
  execute: ExecuteAttempt;
  policy: CalibrationPolicy;
  /** Whether the caller has abandoned the result, checked between attempts. */
  stopped: () => boolean;
}): Promise<CalibratedRun> => {
  const { session, runsFor, execute, policy, stopped } = options;
  let windows = [...options.windows];
  let growths = 0;
  let replans = 0;
  for (;;) {
    const attempt = await execute({
      shader: session.shader,
      runCount: runsFor(session.shader),
      windows,
      preview: policy.preview,
    });
    if (!attempt.ok) {
      return attempt;
    }
    const { result } = attempt;
    if (result.cancelled || stopped()) {
      return { ok: true, result, windows };
    }
    if (result.overflowRuns > 0) {
      if (growths >= policy.maxSlabGrowths) {
        return { ok: true, result, windows };
      }
      growths += 1;
      const grown = growSlabs(session, policy.slabGrowth);
      if (!grown.ok) {
        return grown;
      }
      continue;
    }
    if (anyEscapes(result.metricRanges) && replans < policy.maxWindowReplans) {
      replans += 1;
      windows = windowsFromObserved(
        result.metricRanges,
        windows,
        session.shader.histogramBins,
        RERUN_WINDOW_MARGIN,
      );
      continue;
    }
    return { ok: true, result, windows };
  }
};

/**
 * The slab each derived place gets for the full run, from the probe's per-run
 * maxima: the observed maximum plus margin, unless a heavy-tailed outlier
 * would need a slab past `GPU_ARENA_SLAB_BYTES` — that shape belongs on the
 * CPU.
 */
export const slabsFromProbe = (
  session: CalibrationSession,
  probe: GpuExperimentResult,
  placeCounts: readonly number[],
):
  | { ok: true; capacities: Map<string, number> }
  | { ok: false; reason: string } => {
  const capacities = new Map<string, number>();
  for (const [
    slot,
    placeIndex,
  ] of session.shader.derivedCapacityPlaceIndices.entries()) {
    const place = session.backend.profile.places[placeIndex]!;
    const stats = probe.derivedPlaceMaxes[slot] ?? { max: 0, meanRunMax: 0 };
    const capacity = Math.max(
      8,
      Math.ceil(stats.max * 1.5) + 4,
      placeCounts[placeIndex] ?? 0,
    );
    const slabBytes = capacity * Math.max(1, tokenWordCount(place)) * 4;
    if (
      stats.max > 4 * Math.max(1, stats.meanRunMax) &&
      slabBytes > GPU_ARENA_SLAB_BYTES
    ) {
      return {
        ok: false,
        reason: `Probing \`${place.name}\` saw outlier runs reach ${stats.max} tokens against a typical per-run maximum of ${Math.round(stats.meanRunMax)}. Sizing every run for the outlier would take ${Math.round(slabBytes / 1024)} KB per run — that heavy-tailed shape needs a per-run token arena, so this experiment runs on the CPU.`,
      };
    }
    capacities.set(place.id, capacity);
  }
  return { ok: true, capacities };
};

/**
 * Calibrates derived capacities before the handle exists, so the arena case
 * can refuse cleanly and the caller falls back to the CPU: probes a small
 * prefix of the runs at generous slabs (growing on overflow), sizes each
 * place's slab from the observed maxima, and recompiles at those. The same
 * probe observes the metric ranges, seeding the histogram windows.
 */
export const probeDerivedCapacities = async (options: {
  session: CalibrationSession;
  runCount: number;
  windowInputs: readonly MetricWindowInput[];
  placeCounts: readonly number[];
  execute: ExecuteAttempt;
}): Promise<
  { ok: true; windows: MetricWindow[] } | { ok: false; reason: string }
> => {
  const { session, runCount, placeCounts, execute } = options;
  const probeWindows = planInitialWindows(
    options.windowInputs,
    session.shader.histogramBins,
  );
  const probe = await runUntilCalibrated({
    session,
    runsFor: (shader) => probeRunCount(shader, runCount),
    windows: probeWindows,
    execute,
    policy: PROBE_POLICY,
    stopped: () => false,
  });
  if (!probe.ok) {
    return probe;
  }
  if (probe.result.overflowRuns > 0) {
    const largest = Math.max(0, ...session.capacities.values());
    return {
      ok: false,
      reason: `Probing this net's token counts kept overflowing past ${largest.toLocaleString()} tokens per place; running on the CPU, which sizes its buffers dynamically.`,
    };
  }
  const slabs = slabsFromProbe(session, probe.result, placeCounts);
  if (!slabs.ok) {
    return slabs;
  }
  const recompiled = recompileAt(
    session,
    slabs.capacities,
    "Recompiling at the probed token capacities failed",
  );
  if (!recompiled.ok) {
    return recompiled;
  }
  return {
    ok: true,
    windows: windowsFromObserved(
      probe.result.metricRanges,
      probeWindows,
      session.shader.histogramBins,
      PROBE_WINDOW_MARGIN,
    ),
  };
};

/**
 * Calibrates guessed windows from a preview-sized prefix of the runs before
 * the full attempt, when no capacity probe already did.
 */
export const probeWindows = async (options: {
  session: CalibrationSession;
  windows: readonly MetricWindow[];
  execute: ExecuteAttempt;
}): Promise<CalibratedRun> => {
  const { session, windows, execute } = options;
  const attempt = await execute({
    shader: session.shader,
    runCount: GPU_PREVIEW_RUNS,
    windows,
    preview: false,
  });
  if (!attempt.ok) {
    return attempt;
  }
  return {
    ok: true,
    result: attempt.result,
    windows: windowsFromObserved(
      attempt.result.metricRanges,
      windows,
      session.shader.histogramBins,
      PROBE_WINDOW_MARGIN,
    ),
  };
};

/**
 * Records a batch's calibration for later batches on the same marking.
 *
 * Concurrent leases of one backend store to the same key, and a batch that
 * started before another grew a slab can finish after it. Slabs only grow, so
 * an entry holding a larger slab for any place is the newer knowledge and is
 * kept; otherwise the latest writer wins.
 */
export const rememberCalibration = (
  calibrations: Map<string, GpuCalibration>,
  key: string,
  session: CalibrationSession,
  windows: readonly MetricWindow[],
): void => {
  const current = calibrations.get(key);
  const staleSlab =
    current !== undefined &&
    [...current.capacities].some(
      ([placeId, capacity]) =>
        capacity > (session.capacities.get(placeId) ?? 0),
    );
  if (staleSlab) {
    return;
  }
  calibrations.set(key, {
    windows,
    capacities: new Map(session.capacities),
    shader: session.shader,
  });
};
