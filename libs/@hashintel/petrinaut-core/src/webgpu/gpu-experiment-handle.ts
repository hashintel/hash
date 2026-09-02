/**
 * Presents a GPU run as a `MonteCarloExperiment`, so callers need no branch.
 *
 * The provider subscribes to `status`/`progress`/`metrics`/`events` and does not
 * care which backend produced them. Keeping that contract identical is what lets
 * the GPU path be a setting rather than a parallel UI.
 *
 * Supportability is resolved *before* the handle exists — eligibility, HIR
 * lowering, shader generation and the capacity probe all happen in `create...`,
 * which returns a reason instead of a handle when the net cannot run. A handle
 * that could fail on `start()` would leave the caller unable to fall back
 * cleanly, because by then the experiment is already registered and showing as
 * running.
 */
import {
  appendMetricFrames,
  createEmptyMetricsState,
  createEventStream,
  createReadableStore,
} from "../simulation/monte-carlo/runtime/experiment-stores";
import { getMaxFrameNumber } from "../simulation/monte-carlo/time";
import { requestGpuExperimentBackend } from "./backend";
import { encodeInitialTokenWords } from "./compile-net-shader";
import { placeCountCeiling } from "./eligibility";
import { gpuBackendSetupKey } from "./gpu-backend-cache";
import {
  probeDerivedCapacities,
  probeWindows,
  rememberCalibration,
  RUN_POLICY,
  runUntilCalibrated,
} from "./gpu-experiment-handle/calibration";
import { createFrameMerger } from "./gpu-experiment-handle/frame-merge";
import { deriveRunParameters } from "./gpu-experiment-handle/run-parameters";
import { toGpuMetricFrames, toGpuMetricSpecs } from "./gpu-metric-frames";
import {
  anyEscapes,
  calibrationKey,
  planInitialWindows,
} from "./metric-windows";
import { GPU_PREVIEW_RUNS, runGpuExperiment } from "./runner";

import type { ExperimentRunPlan } from "../experiments/experiment-request";
import type { PetrinautExtensionSettings } from "../extensions";
import type { HirArtifacts } from "../hir-runtime";
import type { InitialMarking } from "../simulation/api";
import type { MonteCarloMetricSpec } from "../simulation/monte-carlo/metrics";
import type {
  MonteCarloExperiment,
  MonteCarloExperimentEvent,
  MonteCarloExperimentState,
} from "../simulation/monte-carlo/runtime/experiment";
import type { MonteCarloRunConfig } from "../simulation/monte-carlo/types";
import type { MonteCarloWorkerProgress } from "../simulation/monte-carlo/worker/messages";
import type { SDCPN } from "../types/sdcpn";
import type { GpuOdeMethod } from "./compile-net-shader";
import type { GpuBackendCache } from "./gpu-backend-cache";
import type {
  CalibrationSession,
  ExecuteAttempt,
} from "./gpu-experiment-handle/calibration";
import type { MetricWindow } from "./metric-windows";

export type CreateGpuMonteCarloExperimentConfig = {
  sdcpn: SDCPN;
  /** Compiled artifacts for this net, carrying the HIR the shader is built from. */
  hirArtifacts: HirArtifacts;
  extensions?: PetrinautExtensionSettings;
  initialMarking: InitialMarking;
  parameterValues: Record<string, string>;
  seed: number;
  dt: number;
  maxTime: number;
  runCount: number;
  metricSpecs: readonly MonteCarloMetricSpec[];
  /**
   * Per-run overrides for a sweep over parameter ranges. Only numeric
   * parameter values are supported; each run's draws are uploaded to the
   * shader's per-run parameter buffer. At most one of `runs` and `runPlan`
   * may be present.
   */
  runs?: readonly MonteCarloRunConfig[];
  /**
   * The compact form of `runs`: per-run numeric values in one run-major
   * array, converted straight into the shader's per-run buffer.
   */
  runPlan?: ExperimentRunPlan;
  /**
   * Reuses one device + compiled shader (and its learned calibration)
   * across batches whose setup key matches — see `gpu-backend-cache`. The
   * host that lives as long as the session owns the cache; without one,
   * every batch builds and destroys its own backend.
   */
  backendCache?: GpuBackendCache;
  /** Defaults to RK4 — see `backend.ts` for why that is not Euler. */
  odeMethod?: GpuOdeMethod;
  /** Caps runs per tile below the device's limit. For tests and benchmarks. */
  maxRunsPerTile?: number;
  /**
   * Called with problems only detectable once the run has finished — a
   * histogram whose edge bins clamped samples. The `warnings` returned at
   * creation are assembled before the run and cannot carry these.
   */
  onWarning?: (warning: string) => void;
};

export type CreateGpuMonteCarloExperimentResult =
  | {
      supported: true;
      handle: MonteCarloExperiment;
      /** Adapter description, for recording which device ran the experiment. */
      deviceInfo: string;
      /** Notes that did not prevent the run, surfaced to the user. */
      warnings: string[];
    }
  | {
      supported: false;
      reason: string;
      /**
       * Which gate refused, so a caller can classify without parsing `reason`.
       * `metrics-unsupported` is the one the backend cannot see, because the
       * metric gate runs before the backend is asked.
       */
      cause:
        | "no-device"
        | "net-unsupported"
        | "shader-generation"
        | "metrics-unsupported";
    };

/** Progress with no runs advanced yet. */
const initialProgress = (runCount: number): MonteCarloWorkerProgress => ({
  activeRuns: runCount,
  advancedRuns: 0,
  allFinished: false,
  completedRuns: 0,
  erroredRuns: 0,
  frameNumber: 0,
  runCount,
  time: 0,
});

/** A place's initial token count: a plain count, or a typed marking's length. */
const initialCount = (marking: InitialMarking[string] | undefined): number =>
  typeof marking === "number"
    ? marking
    : Array.isArray(marking)
      ? marking.length
      : 0;

/**
 * Prepares a GPU-backed experiment, or explains why it is not possible.
 */
export async function createGpuMonteCarloExperiment(
  config: CreateGpuMonteCarloExperimentConfig,
): Promise<CreateGpuMonteCarloExperimentResult> {
  const gpuMetrics = toGpuMetricSpecs(config.metricSpecs);
  if (!gpuMetrics.ok) {
    return {
      supported: false,
      cause: "metrics-unsupported",
      reason: gpuMetrics.reason,
    };
  }
  const metricIds = gpuMetrics.metrics.map((metric) => metric.id);

  const derived = deriveRunParameters(
    config.runs,
    config.runPlan,
    config.runCount,
  );
  if (!derived.ok) {
    return {
      supported: false,
      cause: "net-unsupported",
      reason: derived.reason,
    };
  }
  const { runParameters } = derived;

  const buildBackend = () =>
    requestGpuExperimentBackend({
      sdcpn: config.sdcpn,
      hirArtifacts: config.hirArtifacts,
      extensions: config.extensions,
      parameterValues: config.parameterValues,
      dt: config.dt,
      metrics: gpuMetrics.metrics,
      odeMethod: config.odeMethod ?? "rk4",
      initialMarking: config.initialMarking,
      runParameters: runParameters.ids,
    });
  const backend = config.backendCache
    ? await config.backendCache.acquire(
        gpuBackendSetupKey({
          sdcpn: config.sdcpn,
          extensions: config.extensions,
          hirArtifacts: config.hirArtifacts,
          parameterValues: config.parameterValues,
          runParameterIds: runParameters.ids,
          metricIds,
          dt: config.dt,
          odeMethod: config.odeMethod ?? "rk4",
          initialMarking: config.initialMarking,
        }),
        buildBackend,
      )
    : await buildBackend();
  if (!backend.supported) {
    return {
      supported: false,
      cause: backend.cause,
      reason: backend.reason,
    };
  }
  // Ends this batch's lease. Setup failures evict — an unsupported setup
  // must not be handed to the next batch — and without a cache both paths
  // reduce to destroying the batch's own device.
  const releaseBackend = (options?: { evict?: boolean }) => {
    if (config.backendCache) {
      config.backendCache.release(backend, options);
    } else {
      backend.handle.device.destroy();
    }
  };

  // The CPU's rounding: snap within an epsilon of a whole step, else ceil
  // (`monte-carlo/time.ts`), so both backends step the same frame count.
  const frameLimit = Math.max(1, getMaxFrameNumber(config.maxTime, config.dt));
  const status = createReadableStore<MonteCarloExperimentState>("Initializing");
  const progress = createReadableStore<MonteCarloWorkerProgress | null>(null);
  const metrics = createReadableStore(createEmptyMetricsState());
  const events = createEventStream<MonteCarloExperimentEvent>();

  let disposed = false;
  // Read through a function where control flow crosses awaits, so the
  // narrowing-based lint cannot claim the flag is constant.
  const isDisposed = (): boolean => disposed;
  let running = false;
  let aborted = false;
  // A minimal `AbortSignalLike`: the runner only reads `aborted`, and building
  // a real AbortController would pull a DOM global into this package.
  const signal = {
    get aborted() {
      return aborted;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const placeCounts = backend.profile.places.map((place) =>
    initialCount(config.initialMarking[place.id]),
  );

  progress.set(initialProgress(config.runCount));
  status.set("Ready");

  const finish = (outcome: "complete" | "cancelled") => {
    running = false;
    const finalProgress = progress.get() ?? initialProgress(config.runCount);
    if (outcome === "complete") {
      status.set("Complete");
      events.emit({ type: "complete", progress: finalProgress });
    } else {
      status.set("Cancelled");
      events.emit({ type: "cancelled", progress: finalProgress });
    }
  };

  const fail = (message: string) => {
    running = false;
    status.set("Error");
    events.emit({ type: "error", message, itemId: null });
  };

  // A lost device turns every later GPU call into a silent no-op, so without
  // this watcher a loss mid-run could surface as a truncated "Complete".
  // `dispose()` also triggers it, via `destroy()` — that is the one intentional
  // loss, filtered by the `disposed` flag.
  void backend.handle.device.lost.then((info) => {
    if (!disposed) {
      fail(`GPU device lost: ${info.message || info.reason}`);
    }
  });

  // A marking larger than a typed place's declared capacity has nowhere to
  // go: the slots are sized from the capacity, and writing past them would
  // corrupt the neighbouring place's tokens or the next run's header. The
  // CPU engine grows its buffers dynamically, so the net still runs there.
  // (Derived probe slabs start at four times the marking, so only declared
  // capacities can trip this.)
  for (const [placeIndex, place] of backend.profile.places.entries()) {
    const count = placeCounts[placeIndex]!;
    if (place.capacity > 0 && count > place.capacity) {
      releaseBackend({ evict: true });
      return {
        supported: false,
        cause: "net-unsupported",
        reason: `Place \`${place.name}\` starts with ${count} tokens but declares a capacity of ${place.capacity}; the GPU backend sizes its buffers from the capacity, so the initial marking must fit. Raise the capacity or run on the CPU.`,
      };
    }
  }

  const placeTokenWords = backend.profile.places.map((place) =>
    encodeInitialTokenWords(place, config.initialMarking[place.id]),
  );

  // Frame 0 is the initial state, which the device never samples; the host
  // knows it exactly (every run starts identical), so it is emitted here —
  // matching the CPU simulator's observation of the initial marking before
  // any step.
  const placeIndexById = new Map(
    backend.profile.places.map((place, index) => [place.id, index]),
  );
  const initialHistogramFrames = gpuMetrics.metrics.map((metric) => {
    const count = placeCounts[placeIndexById.get(metric.placeId) ?? -1] ?? 0;
    return {
      frameNumber: 0,
      metricId: metric.id,
      bins: [[count, config.runCount]] as [number, number][],
      // An exact count: the cell of one integer.
      binExtent: { below: 0.5, above: 0.5 },
      sampleCount: config.runCount,
    };
  });
  if (initialHistogramFrames.length > 0) {
    metrics.set(
      appendMetricFrames(
        metrics.get(),
        toGpuMetricFrames(
          initialHistogramFrames,
          config.metricSpecs,
          config.dt,
        ),
      ),
    );
  }
  const frameMerger = createFrameMerger();

  // What window planning knows per metric: the sampled place's initial
  // count, and its hard ceiling when it has one (a ceiling makes the window
  // exact by construction — no calibration needed). A derived probe slab is
  // not a ceiling: its counts calibrate empirically.
  const windowInputs = gpuMetrics.metrics.map((metric) => {
    const placeIndex = placeIndexById.get(metric.placeId) ?? -1;
    const place = backend.profile.places[placeIndex];
    return {
      initialCount: placeCounts[placeIndex] ?? 0,
      countCeiling:
        place === undefined || place.capacitySource === "derived"
          ? null
          : placeCountCeiling(place),
    };
  });

  // The shader in force and its derived slabs: the capacity probe and
  // overflow growth swap them by recompiling. Windows are uniforms and need
  // no recompile.
  const session: CalibrationSession = {
    backend,
    shader: backend.shader,
    capacities: new Map(backend.derivedCapacities),
  };

  // What earlier batches on this backend learned about this marking: reuse
  // it instead of re-probing — a sweep instantiates a batch per ladder rung,
  // and re-running the probes per batch was the largest pre-first-frame
  // cost. A calibration that does not cover this batch's dynamics heals
  // through the same overflow/escape re-runs as a fresh one.
  const batchCalibrationKey = calibrationKey({
    placeCounts,
    placeTokenWords,
    metricIds,
  });
  const cachedCalibration = backend.calibration.get(batchCalibrationKey);
  const storeCalibration = (windows: readonly MetricWindow[]) => {
    if (metricIds.length === 0 && session.capacities.size === 0) {
      return;
    }
    rememberCalibration(
      backend.calibration,
      batchCalibrationKey,
      session,
      windows,
    );
  };

  const executeAttempt: ExecuteAttempt = ({
    shader,
    runCount: attemptRunCount,
    windows,
    preview,
  }) =>
    runGpuExperiment(backend.handle, shader, {
      runCount: attemptRunCount,
      frameLimit,
      framesPerDispatch: backend.framesPerDispatch,
      seed: config.seed,
      initial: { placeCounts, placeTokenWords },
      metricWindows: windows,
      previewRuns: preview && metricIds.length > 0 ? GPU_PREVIEW_RUNS : null,
      ...(config.maxRunsPerTile === undefined
        ? {}
        : { maxRunsPerTile: config.maxRunsPerTile }),
      onFrames: (chunkFrames) => {
        if (disposed) {
          return;
        }
        metrics.set(
          frameMerger.ingest(
            metrics.get(),
            toGpuMetricFrames(chunkFrames, config.metricSpecs, config.dt),
          ),
        );
      },
      // A probe runs a prefix of the runs; per-run draws are laid out by
      // absolute run index, so the matching prefix of the value buffer is
      // exactly the probe runs' draws.
      ...(runParameters.values === undefined
        ? {}
        : {
            runParameterValues: runParameters.values.subarray(
              0,
              attemptRunCount * runParameters.ids.length,
            ),
          }),
      signal,
      onChunk: ({ framesDone, runsCompleted, runsInTile }) => {
        if (disposed) {
          return;
        }
        // Overall position, monotone across tiles: finished tiles count as
        // full passes, the running tile as its frame fraction. A single-tile
        // experiment reduces to `framesDone` exactly.
        const overallFrames = Math.round(
          ((runsCompleted + runsInTile * (framesDone / frameLimit)) /
            config.runCount) *
            frameLimit,
        );
        progress.set({
          activeRuns: config.runCount - runsCompleted,
          advancedRuns: runsCompleted + runsInTile,
          allFinished: false,
          completedRuns: runsCompleted,
          erroredRuns: 0,
          frameNumber: overallFrames,
          runCount: config.runCount,
          time: overallFrames * config.dt,
        });
      },
    });

  let calibratedWindows: MetricWindow[] | null = null;
  if (cachedCalibration) {
    session.shader = cachedCalibration.shader;
    for (const [placeId, capacity] of cachedCalibration.capacities) {
      session.capacities.set(placeId, capacity);
    }
    calibratedWindows = [...cachedCalibration.windows];
  } else if (session.capacities.size > 0) {
    const probed = await probeDerivedCapacities({
      session,
      runCount: config.runCount,
      windowInputs,
      placeCounts,
      execute: executeAttempt,
    });
    if (!probed.ok) {
      disposed = true;
      releaseBackend({ evict: true });
      return {
        supported: false,
        cause: "net-unsupported",
        reason: probed.reason,
      };
    }
    calibratedWindows = probed.windows;
    storeCalibration(calibratedWindows);
  }

  const run = async () => {
    // Guessed windows (any sampled place without a ceiling) probe with a
    // preview-sized prefix of the runs first, unless the capacity probe
    // already calibrated them at creation.
    let windows =
      calibratedWindows ??
      planInitialWindows(windowInputs, session.shader.histogramBins);
    const guessedWindows = windowInputs.some(
      (input) => input.countCeiling === null,
    );
    if (
      calibratedWindows === null &&
      guessedWindows &&
      config.runCount > GPU_PREVIEW_RUNS &&
      metricIds.length > 0 &&
      !aborted
    ) {
      const probe = await probeWindows({
        session,
        windows,
        execute: executeAttempt,
      });
      if (isDisposed()) {
        return;
      }
      if (!probe.ok) {
        fail(probe.reason);
        return;
      }
      if (probe.result.cancelled) {
        finish("cancelled");
        return;
      }
      windows = probe.windows;
      storeCalibration(windows);
    }

    const calibrated = await runUntilCalibrated({
      session,
      runsFor: () => config.runCount,
      windows,
      execute: executeAttempt,
      policy: RUN_POLICY,
      stopped: () => isDisposed() || aborted,
    });

    if (isDisposed()) {
      return;
    }
    if (!calibrated.ok) {
      fail(calibrated.reason);
      return;
    }
    const { result } = calibrated;
    if (result.overflowRuns > 0 && !result.cancelled) {
      fail(
        "Token counts kept outgrowing their derived capacities even after growth; run this experiment on the CPU, which sizes its buffers dynamically.",
      );
      return;
    }
    if (!result.cancelled) {
      // The batch's final calibration — grown slabs, replanned windows — is
      // the best knowledge for the next batch on this marking.
      storeCalibration(calibrated.windows);
      if (anyEscapes(result.metricRanges)) {
        // Unreachable when the recalibrated re-run executed (same seeds, same
        // trajectories, exact observed range); kept as the honest safety net.
        config.onWarning?.(
          "Some samples fell outside the histogram's calibrated range, so the distribution's edges are clamped.",
        );
      }
    }

    // Chunks already streamed most frames; the final decode is the
    // authoritative set (it trims trailing empty frames), so it replaces
    // rather than appends.
    metrics.set(
      appendMetricFrames(
        createEmptyMetricsState(),
        toGpuMetricFrames(
          [...initialHistogramFrames, ...result.frames],
          config.metricSpecs,
          config.dt,
        ),
      ),
    );
    progress.set({
      activeRuns: 0,
      advancedRuns: config.runCount,
      allFinished: !result.cancelled,
      completedRuns: result.completedRuns,
      erroredRuns: 0,
      frameNumber: frameLimit,
      runCount: config.runCount,
      time: frameLimit * config.dt,
    });

    finish(result.cancelled ? "cancelled" : "complete");
  };

  const handle: MonteCarloExperiment = {
    status,
    progress,
    metrics,
    // Metrics reduce on-device into aggregates, so per-run values never reach
    // the host; the store stays empty. Callers needing replicates use the CPU
    // backend.
    runResults: createReadableStore(new Map()),
    events,
    start() {
      if (disposed || running) {
        return;
      }
      running = true;
      status.set("Running");
      void run().catch((error: unknown) => {
        if (disposed) {
          return;
        }
        fail(
          error instanceof Error
            ? error.message
            : "Unknown error during GPU computation",
        );
      });
    },
    cancel() {
      if (disposed || !running) {
        return;
      }
      aborted = true;
      // The in-flight chunk still completes; `run` reports the cancellation once
      // the runner returns, so status is not set optimistically here.
    },
    dispose() {
      if (disposed) {
        return;
      }
      aborted = true;
      disposed = true;
      running = false;
      releaseBackend();
    },
  };

  return {
    supported: true,
    handle,
    deviceInfo: backend.handle.info,
    warnings: backend.warnings,
  };
}
