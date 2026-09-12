/**
 * The attempts one GPU experiment makes once `start()` is called, in order:
 * calibrate what the shader cannot know up front, then run in full.
 *
 * Every attempt streams its chunks through the same `execute`, so the first
 * probe's frames reach the charts as early as any later chunk. Keeping the
 * ordering here, over a plain `ExecuteAttempt`, is what lets it be tested
 * without a device.
 */
import { planInitialWindows } from "../metric-windows";
import {
  anyMetricHalted,
  CACHED_RUN_POLICY,
  probeDerivedCapacities,
  probeRunCount,
  probeWindows,
  RUN_POLICY,
  runUntilCalibrated,
} from "./calibration";

import type { MetricWindow, MetricWindowInput } from "../metric-windows";
import type { GpuExperimentResult } from "../runner";
import type { CalibrationSession, ExecuteAttempt } from "./calibration";

export type RunPhaseOutcome =
  /** The caller cancelled or disposed the experiment before the full attempt. */
  | { kind: "stopped" }
  | { kind: "failed"; reason: string }
  /**
   * The full attempt's last result — possibly cancelled midway, possibly
   * still overflowing or halted by a metric — with the windows it ran at.
   */
  | {
      kind: "calibrated";
      result: GpuExperimentResult;
      windows: MetricWindow[];
    };

/**
 * Whether an uncalibrated run must probe before its full attempt: a derived
 * slab needs measuring, or a metric has no declared ceiling to plan its
 * window from. A run that needs neither has nothing another batch on the
 * same marking could wait for.
 */
export const needsProbe = (
  session: Pick<CalibrationSession, "capacities">,
  windowInputs: readonly MetricWindowInput[],
): boolean =>
  session.capacities.size > 0 ||
  windowInputs.some((input) => input.ceiling === null);

/**
 * Probes when nothing is calibrated yet — derived capacities first, which
 * also observes the metric ranges; else the blind windows alone — then runs
 * the full attempt under `RUN_POLICY`. A cached calibration runs under
 * `CACHED_RUN_POLICY` instead, and outgrowing it sends the run back through
 * the probe — unless a metric halted a run, which a fresh probe would only
 * halt again.
 */
export const runCalibratedExperiment = async (options: {
  session: CalibrationSession;
  /** Windows an earlier batch calibrated on this marking; null probes afresh. */
  calibratedWindows: readonly MetricWindow[] | null;
  windowInputs: readonly MetricWindowInput[];
  placeCounts: readonly number[];
  runCount: number;
  execute: ExecuteAttempt;
  /** Whether the caller has abandoned the run, checked between attempts. */
  stopped: () => boolean;
  /**
   * Hears each calibration a probe settles, for later batches on this
   * marking. A probe a metric halted settles none: a batch adopting it would
   * skip its own probe and meet the halt only after a full attempt.
   */
  remember: (windows: readonly MetricWindow[]) => void;
  /**
   * The failure an attempt's halted-metric counts amount to over the runs it
   * executed, or null. Seeds derive from the run index, so a run a probe
   * halted halts again in full: the probe's counts end the run before the
   * full attempt executes.
   */
  metricFailure: (
    metricErrors: readonly number[],
    runCount: number,
  ) => string | null;
  /**
   * Slabs a fresh probe may not size below: the grown ones a cached
   * calibration's full attempt still overflowed at.
   */
  slabFloor?: ReadonlyMap<string, number>;
}): Promise<RunPhaseOutcome> => {
  const {
    session,
    calibratedWindows,
    windowInputs,
    placeCounts,
    runCount,
    execute,
    stopped,
    remember,
    metricFailure,
    slabFloor,
  } = options;

  let windows: readonly MetricWindow[];
  if (calibratedWindows !== null) {
    windows = calibratedWindows;
  } else if (!needsProbe(session, windowInputs)) {
    windows = planInitialWindows(windowInputs, session.shader.histogramBins);
  } else if (session.capacities.size > 0) {
    const probed = await probeDerivedCapacities({
      session,
      runCount,
      windowInputs,
      placeCounts,
      execute,
      stopped,
      slabFloor,
    });
    if (stopped()) {
      return { kind: "stopped" };
    }
    if (!probed.ok) {
      return { kind: "failed", reason: probed.reason };
    }
    const probedFailure = metricFailure(probed.metricErrors, probed.probeRuns);
    if (probedFailure !== null) {
      return { kind: "failed", reason: probedFailure };
    }
    windows = probed.windows;
    remember(windows);
  } else {
    const probeRuns = probeRunCount(session.shader, runCount);
    const probe = await probeWindows({
      session,
      windows: planInitialWindows(windowInputs, session.shader.histogramBins),
      execute,
      runCount: probeRuns,
    });
    if (!probe.ok) {
      return { kind: "failed", reason: probe.reason };
    }
    if (probe.result.cancelled || stopped()) {
      return { kind: "stopped" };
    }
    const probeFailure = metricFailure(probe.result.metricErrors, probeRuns);
    if (probeFailure !== null) {
      return { kind: "failed", reason: probeFailure };
    }
    windows = probe.windows;
    remember(windows);
  }

  const calibrated = await runUntilCalibrated({
    session,
    runsFor: () => runCount,
    windows,
    execute,
    policy: calibratedWindows === null ? RUN_POLICY : CACHED_RUN_POLICY,
    stopped,
  });
  if (!calibrated.ok) {
    return { kind: "failed", reason: calibrated.reason };
  }
  if (
    calibratedWindows !== null &&
    calibrated.result.overflowRuns > 0 &&
    !anyMetricHalted(calibrated.result) &&
    !calibrated.result.cancelled &&
    !stopped()
  ) {
    // A calibration learned on another selection undersizes this one past
    // what growth covers: probe afresh, as a first batch would, from the
    // grown slabs — and never below them, so the probe's result is at least
    // the stale entry's on every place and replaces it.
    return runCalibratedExperiment({
      ...options,
      calibratedWindows: null,
      slabFloor: new Map(session.capacities),
    });
  }
  return {
    kind: "calibrated",
    result: calibrated.result,
    windows: calibrated.windows,
  };
};
