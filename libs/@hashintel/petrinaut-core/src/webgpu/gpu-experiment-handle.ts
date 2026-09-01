import { PLACE_CAPACITY_UNBOUNDED } from "../simulation/engine/capacity";
/**
 * Presents a GPU run as a `MonteCarloExperiment`, so callers need no branch.
 *
 * The provider subscribes to `status`/`progress`/`metrics`/`events` and does not
 * care which backend produced them. Keeping that contract identical is what lets
 * the GPU path be a setting rather than a parallel UI.
 *
 * Supportability is resolved *before* the handle exists — eligibility, HIR
 * lowering and shader generation all happen in `create...`, which returns a
 * reason instead of a handle when the net cannot run. A handle that could fail
 * on `start()` would leave the caller unable to fall back cleanly, because by
 * then the experiment is already registered and showing as running.
 */
import {
  appendMetricFrames,
  createEmptyMetricsState,
  createEventStream,
  createReadableStore,
} from "../simulation/monte-carlo/runtime/experiment-stores";
import { getMaxFrameNumber } from "../simulation/monte-carlo/time";
import { requestGpuExperimentBackend } from "./backend";
import { gpuBackendSetupKey } from "./gpu-backend-cache";
import { toGpuMetricFrames, toGpuMetricSpecs } from "./gpu-metric-frames";
import {
  anyEscapes,
  calibrationKey,
  planInitialWindows,
  windowsFromObserved,
} from "./metric-windows";
import { runGpuExperiment } from "./runner";

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
   * `parameterValues` are supported (validated by the backend adapter); each
   * run's draws are uploaded to the shader's per-run parameter buffer.
   * At most one of `runs` and `runPlan` may be present.
   */
  runs?: readonly MonteCarloRunConfig[];
  /**
   * The compact form of `runs`: per-run numeric values in one run-major
   * array, converted straight into the shader's per-run buffer with no
   * per-run records to validate or parse.
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
   * Called with problems only detectable once the run has finished — today, a
   * histogram whose top bin saturated. The `warnings` returned at creation are
   * assembled before the run and cannot carry these, and without a channel the
   * results would be presented as fact.
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
       *
       * `requestGpuExperimentBackend` already determines this and used to discard
       * it here; `metrics-unsupported` is the one case it cannot see, because the
       * metric gate runs before the backend is asked.
       */
      cause:
        | "no-device"
        | "net-unsupported"
        | "shader-generation"
        | "metrics-unsupported";
    };

/**
 * Runs the window probe executes before a large run with guessed windows.
 * Small enough to finish in milliseconds, large enough that its observed
 * range plus margin almost always covers the full run's.
 */
const GPU_WINDOW_PROBE_RUNS = 128;

/**
 * Memory the capacity probe may hold at once: slabs grow geometrically until
 * the runs stop overflowing, and the probe sheds runs to stay inside this
 * budget — few runs afford big slabs, and even eight runs bound a place's
 * maximum well enough for a 1.5×-margin slab with the overflow-grow loop
 * behind it.
 */
const GPU_PROBE_MEMORY_BYTES = 128 * 1024 * 1024;

/**
 * The largest per-run slab a single derived-capacity place may claim when
 * its probe shows a heavy tail — outlier runs far past the typical maximum.
 * Below it, sizing for the outlier is cheap enough to just do; past it, the
 * right structure is the planned per-run token arena (shared place-tagged
 * slots sized by the simultaneous total), and until that exists the
 * experiment runs on the CPU, which sizes its buffers dynamically.
 */
const GPU_ARENA_SLAB_BYTES = 64 * 1024;

/** Progress with no runs advanced yet. */
function initialProgress(runCount: number): MonteCarloWorkerProgress {
  return {
    activeRuns: runCount,
    advancedRuns: 0,
    allFinished: false,
    completedRuns: 0,
    erroredRuns: 0,
    frameNumber: 0,
    runCount,
    time: 0,
  };
}

/**
 * Prepares a GPU-backed experiment, or explains why it is not possible.
 */
type DerivedRunParameters =
  | { ok: true; ids: readonly string[]; values?: Float32Array }
  | { ok: false; reason: string };

/**
 * Turns per-run configs into the shader's parameter buffer: the sorted set
 * of overridden identifiers, and one f32 draw per (run, identifier),
 * run-major. Refuses shapes the shader cannot express — per-run seeds or
 * markings, runs overriding different parameters, non-numeric values — so
 * the caller reports why instead of computing something else.
 */
function deriveRunParameters(
  runs: readonly MonteCarloRunConfig[] | undefined,
  runPlan: ExperimentRunPlan | undefined,
  runCount: number,
): DerivedRunParameters {
  if (runPlan !== undefined && runPlan.ids.length > 0) {
    // A plan is uniform by construction; only the length and the values'
    // finiteness (all the shader's f32 buffer can carry) need checking.
    const expected = runCount * runPlan.ids.length;
    if (runPlan.values.length !== expected) {
      return {
        ok: false,
        reason: `The run plan carries ${runPlan.values.length} values but ${runCount} runs × ${runPlan.ids.length} parameters needs ${expected}.`,
      };
    }
    const values = new Float32Array(runPlan.values.length);
    for (let index = 0; index < runPlan.values.length; index++) {
      const value = runPlan.values[index]!;
      if (!Number.isFinite(value)) {
        return {
          ok: false,
          reason: `Per-run value \`${value}\` for \`${runPlan.ids[index % runPlan.ids.length]}\` is not a finite number, which is all the GPU's f32 buffer can carry.`,
        };
      }
      values[index] = value;
    }
    return { ok: true, ids: runPlan.ids, values };
  }
  if (runs === undefined || runs.length === 0) {
    return { ok: true, ids: [] };
  }
  if (runs.length !== runCount) {
    return {
      ok: false,
      reason: `The experiment declares ${runCount} runs but supplies ${runs.length} per-run configurations.`,
    };
  }
  // Validate every run before reading any values: keying off the first run
  // alone once let a batch whose first run overrode nothing silently drop
  // every other run's draws (and skip the seed/marking refusal below).
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
  if (ids.length === 0) {
    return { ok: true, ids: [] };
  }
  const values = new Float32Array(runs.length * ids.length);
  for (const [runIndex, run] of runs.entries()) {
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
    for (const [idIndex, id] of ids.entries()) {
      const parsed = Number(overrides[id]);
      if (!Number.isFinite(parsed)) {
        return {
          ok: false,
          reason: `Per-run value \`${overrides[id]}\` for \`${id}\` is not a finite number, which is all the GPU's f32 buffer can carry.`,
        };
      }
      values[runIndex * ids.length + idIndex] = parsed;
    }
  }
  return { ok: true, ids, values };
}

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

  const runParameters = deriveRunParameters(
    config.runs,
    config.runPlan,
    config.runCount,
  );
  if (!runParameters.ok) {
    return {
      supported: false,
      cause: "net-unsupported",
      reason: runParameters.reason,
    };
  }

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
          metricIds: gpuMetrics.metrics.map((metric) => metric.id),
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

  // Uncoloured places carry a plain count; a typed place's initial marking is an
  // array of token records whose length is the count the shader needs.
  const placeCounts = backend.profile.places.map((place) => {
    const marking = config.initialMarking[place.id];
    if (typeof marking === "number") {
      return marking;
    }
    return Array.isArray(marking) ? marking.length : 0;
  });

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
  for (const place of backend.profile.places) {
    const marking = config.initialMarking[place.id];
    const count = Array.isArray(marking)
      ? marking.length
      : typeof marking === "number"
        ? marking
        : 0;
    if (place.capacity > 0 && count > place.capacity) {
      releaseBackend({ evict: true });
      return {
        supported: false,
        cause: "net-unsupported",
        reason: `Place \`${place.name}\` starts with ${count} tokens but declares a capacity of ${place.capacity}; the GPU backend sizes its buffers from the capacity, so the initial marking must fit. Raise the capacity or run on the CPU.`,
      };
    }
  }

  // Typed places start from real token values, not zeroed slots: encode
  // each initial token's attributes in the shader's slot layout (reals as
  // bitcast f32, then integers/booleans as u32), one buffer per place.
  const placeTokenWords = backend.profile.places.map((place) => {
    const marking = config.initialMarking[place.id];
    if (!Array.isArray(marking)) {
      return new Uint32Array(0);
    }
    const stride = place.realFields.length + place.discreteFields.length;
    const words = new Uint32Array(marking.length * stride);
    const floats = new Float32Array(words.buffer);
    for (const [tokenIndex, token] of marking.entries()) {
      const base = tokenIndex * stride;
      for (const [fieldIndex, field] of place.realFields.entries()) {
        floats[base + fieldIndex] = Number(token[field] ?? 0);
      }
      for (const [fieldIndex, field] of place.discreteFields.entries()) {
        const value = token[field];
        words[base + place.realFields.length + fieldIndex] =
          typeof value === "boolean"
            ? value
              ? 1
              : 0
            : Math.round(Number(value ?? 0));
      }
    }
    return words;
  });

  // Frame 0 is the initial state, which the device never samples; the
  // host knows it exactly (every run starts identical), so it is emitted
  // here — matching the CPU simulator's observation of the initial
  // marking before any step.
  const placeIndexById = new Map(
    backend.profile.places.map((place, index) => [place.id, index]),
  );
  const initialHistogramFrames = gpuMetrics.metrics.map((metric) => {
    const count = placeCounts[placeIndexById.get(metric.placeId) ?? -1] ?? 0;
    return {
      frameNumber: 0,
      metricId: metric.id,
      bins: [[count, config.runCount]] as [number, number][],
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

  // A tiled experiment re-delivers earlier frame numbers with cumulative
  // bins (see `runsPerTile`), which the append-only store would duplicate.
  // Streamed keys are remembered (keys only — retaining the frames would
  // duplicate the whole store's data for the experiment's lifetime); the
  // first re-delivery flips to merging each chunk into the store by key,
  // latest delivery winning. A single-tile experiment never re-delivers and
  // keeps the cheap append. The capacity/window probe re-delivers too, so
  // its frames are replaced the same way.
  let seenFrameKeys: Set<string> | null = new Set<string>();
  let cumulativeStream = false;
  const frameKey = (frame: { metricId: string; frameNumber: number }) =>
    `${frame.metricId}\u0000${frame.frameNumber}`;

  // What window planning knows per metric: the sampled place's initial
  // count, and its hard ceiling when it has one (a ceiling makes the
  // window exact by construction — no calibration needed). A derived
  // probe slab is not a ceiling: its counts calibrate empirically.
  const windowInputs = gpuMetrics.metrics.map((metric) => {
    const placeIndex = placeIndexById.get(metric.placeId) ?? -1;
    const place = backend.profile.places[placeIndex];
    const countCeiling = place
      ? place.colored && place.capacitySource === "declared"
        ? place.capacity
        : place.declaredCapacity === PLACE_CAPACITY_UNBOUNDED
          ? null
          : place.declaredCapacity
      : null;
    return { initialCount: placeCounts[placeIndex] ?? 0, countCeiling };
  });

  // The shader in force: derived-capacity growth and the capacity probe
  // swap it by recompiling at new slabs. Windows are uniforms and need no
  // recompile.
  let activeShader = backend.shader;
  const derivedCaps = new Map(backend.derivedCapacities);

  // What earlier batches on this backend learned about this marking: reuse
  // it instead of re-probing — a sweep instantiates a batch per ladder rung,
  // and re-running the capacity and window probes per batch was the largest
  // pre-first-frame cost. A calibration that no longer covers this batch's
  // dynamics heals through the same overflow/escape re-runs as a fresh one,
  // and the store below keeps the cache at the latest knowledge.
  const batchCalibrationKey = calibrationKey({
    placeCounts,
    placeTokenWords,
    metricIds: gpuMetrics.metrics.map((metric) => metric.id),
  });
  const cachedCalibration = backend.calibration.get(batchCalibrationKey);
  const storeCalibration = (windows: readonly MetricWindow[]) => {
    if (gpuMetrics.metrics.length === 0 && derivedCaps.size === 0) {
      return;
    }
    backend.calibration.set(batchCalibrationKey, {
      windows,
      capacities: new Map(derivedCaps),
      shader: activeShader,
    });
  };

  const executeAttempt = (
    attemptRunCount: number,
    metricWindows: readonly MetricWindow[],
  ) =>
    runGpuExperiment(backend.handle, activeShader, {
      runCount: attemptRunCount,
      frameLimit,
      framesPerDispatch: backend.framesPerDispatch,
      seed: config.seed,
      initial: { placeCounts, placeTokenWords },
      metricWindows,
      ...(config.maxRunsPerTile === undefined
        ? {}
        : { maxRunsPerTile: config.maxRunsPerTile }),
      onFrames: (chunkFrames) => {
        if (disposed) {
          return;
        }
        const converted = toGpuMetricFrames(
          chunkFrames,
          config.metricSpecs,
          config.dt,
        );
        if (!cumulativeStream && seenFrameKeys !== null) {
          let redelivered = false;
          for (const frame of chunkFrames) {
            const key = frameKey(frame);
            if (seenFrameKeys.has(key)) {
              redelivered = true;
            }
            seenFrameKeys.add(key);
          }
          if (!redelivered) {
            metrics.set(appendMetricFrames(metrics.get(), converted));
            return;
          }
          cumulativeStream = true;
          seenFrameKeys = null;
        }
        // Merge at the converted level: the store already holds every earlier
        // delivery (initial frames included), so replacing by key needs no
        // second copy of the histogram data.
        const merged = new Map(
          metrics.get().frames.map((frame) => [frameKey(frame), frame]),
        );
        for (const frame of converted) {
          merged.set(frameKey(frame), frame);
        }
        metrics.set(
          appendMetricFrames(createEmptyMetricsState(), [...merged.values()]),
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
        // experiment reduces to `framesDone` exactly. Reporting the raw
        // per-tile `framesDone` made the progress bar and the time display
        // snap back to zero at every tile boundary.
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

  // Derived capacities calibrate before the handle exists, so the arena case
  // can refuse cleanly and the backend-selection walk falls back to the CPU.
  // The probe runs a small prefix of the runs at generous slabs (growing on
  // overflow), streams its frames to the charts, and its per-run maxima
  // decide each place's slab: close to typical → the observed maximum plus
  // margin; a heavy-tailed outlier that would need an oversized slab →
  // the planned per-run token arena's case, which runs on the CPU today.
  // The same probe observes the metric ranges, seeding the histogram
  // windows.
  let calibratedWindows: MetricWindow[] | null = null;
  if (cachedCalibration) {
    activeShader = cachedCalibration.shader;
    for (const [placeId, capacity] of cachedCalibration.capacities) {
      derivedCaps.set(placeId, capacity);
    }
    calibratedWindows = [...cachedCalibration.windows];
  } else if (derivedCaps.size > 0) {
    const probeWindows = planInitialWindows(
      windowInputs,
      activeShader.histogramBins,
    );
    const unsupported = (
      reason: string,
    ): CreateGpuMonteCarloExperimentResult => {
      disposed = true;
      releaseBackend({ evict: true });
      return { supported: false, cause: "net-unsupported", reason };
    };
    // Slabs quadruple per attempt and the probe sheds runs to stay inside
    // the memory budget — eight runs at 16 MB slabs probe as usefully as a
    // hundred at small ones. Seven attempts of ×4 span from the initial
    // guess to counts in the hundreds of thousands before giving up.
    const probeRunsFor = (): number => {
      const bytesPerRun = activeShader.stateWordsPerRun * 4;
      return Math.max(
        Math.min(8, config.runCount),
        Math.min(
          config.runCount,
          GPU_WINDOW_PROBE_RUNS,
          Math.floor(GPU_PROBE_MEMORY_BYTES / Math.max(1, bytesPerRun)),
        ),
      );
    };

    let probe = await executeAttempt(probeRunsFor(), probeWindows);
    for (
      let grow = 0;
      probe.ok && probe.result.overflowRuns > 0 && grow < 7;
      grow++
    ) {
      for (const [placeId, capacity] of derivedCaps) {
        derivedCaps.set(placeId, capacity * 4);
      }
      const regrown = backend.recompile(derivedCaps);
      if (!regrown.ok) {
        return unsupported(
          `Recompiling at a grown token capacity failed: ${regrown.reason}`,
        );
      }
      activeShader = regrown.shader;
      probe = await executeAttempt(probeRunsFor(), probeWindows);
    }
    if (!probe.ok) {
      return unsupported(probe.reason);
    }
    if (probe.result.overflowRuns > 0) {
      const largest = Math.max(
        0,
        ...activeShader.derivedCapacityPlaceIndices.map(
          (placeIndex) =>
            derivedCaps.get(backend.profile.places[placeIndex]?.id ?? "") ?? 0,
        ),
      );
      return unsupported(
        `Probing this net's token counts kept overflowing past ${largest.toLocaleString()} tokens per place; running on the CPU, which sizes its buffers dynamically.`,
      );
    }

    const fullCaps = new Map<string, number>();
    for (const [
      slot,
      placeIndex,
    ] of activeShader.derivedCapacityPlaceIndices.entries()) {
      const place = backend.profile.places[placeIndex]!;
      const stats = probe.result.derivedPlaceMaxes[slot] ?? {
        max: 0,
        meanRunMax: 0,
      };
      const fullCapacity = Math.max(
        8,
        Math.ceil(stats.max * 1.5) + 4,
        placeCounts[placeIndex] ?? 0,
      );
      const stride = Math.max(
        1,
        place.realFields.length + place.discreteFields.length,
      );
      const slabBytes = fullCapacity * stride * 4;
      if (
        stats.max > 4 * Math.max(1, stats.meanRunMax) &&
        slabBytes > GPU_ARENA_SLAB_BYTES
      ) {
        return unsupported(
          `Probing \`${place.name}\` saw outlier runs reach ${stats.max} tokens against a typical per-run maximum of ${Math.round(stats.meanRunMax)}. Sizing every run for the outlier would take ${Math.round(slabBytes / 1024)} KB per run — that heavy-tailed shape needs the planned per-run token arena, so this experiment runs on the CPU.`,
        );
      }
      fullCaps.set(place.id, fullCapacity);
    }
    const recompiled = backend.recompile(fullCaps);
    if (!recompiled.ok) {
      return unsupported(
        `Recompiling at the probed token capacities failed: ${recompiled.reason}`,
      );
    }
    activeShader = recompiled.shader;
    for (const [placeId, capacity] of fullCaps) {
      derivedCaps.set(placeId, capacity);
    }
    calibratedWindows = windowsFromObserved(
      probe.result.metricRanges,
      probeWindows,
      activeShader.histogramBins,
      0.25,
    );
    storeCalibration(calibratedWindows);
  }

  const run = async () => {
    // The calibration loop. Guessed windows (any sampled place without a
    // ceiling) probe with a small prefix of the runs first — unless the
    // capacity probe already ran at creation and calibrated them — then the
    // full attempt runs, and two things recalibrate it in place of user
    // errors: a derived slab overflow grows the slab (recompile) and
    // re-runs; a window escape replans the window from the attempt's own
    // observed range and re-runs. Seeds derive from absolute run indices,
    // so a re-run reproduces the same trajectories — a window re-run cannot
    // escape again, and slab growth is monotone.
    const bins = activeShader.histogramBins;
    let windows = calibratedWindows ?? planInitialWindows(windowInputs, bins);
    const guessedWindows = windowInputs.some(
      (input) => input.countCeiling === null,
    );
    if (
      calibratedWindows === null &&
      guessedWindows &&
      config.runCount > GPU_WINDOW_PROBE_RUNS &&
      gpuMetrics.metrics.length > 0 &&
      !aborted
    ) {
      const probe = await executeAttempt(GPU_WINDOW_PROBE_RUNS, windows);
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
      windows = windowsFromObserved(
        probe.result.metricRanges,
        windows,
        bins,
        0.25,
      );
      storeCalibration(windows);
    }

    let outcome = await executeAttempt(config.runCount, windows);
    let growRetries = 0;
    let windowRetries = 0;
    while (
      outcome.ok &&
      !outcome.result.cancelled &&
      !isDisposed() &&
      !aborted
    ) {
      if (outcome.result.overflowRuns > 0 && growRetries < 3) {
        growRetries++;
        for (const [placeId, capacity] of derivedCaps) {
          derivedCaps.set(placeId, capacity * 2);
        }
        const regrown = backend.recompile(derivedCaps);
        if (!regrown.ok) {
          fail(
            `Recompiling at a grown token capacity failed: ${regrown.reason}`,
          );
          return;
        }
        activeShader = regrown.shader;
        outcome = await executeAttempt(config.runCount, windows);
        continue;
      }
      if (
        outcome.result.overflowRuns === 0 &&
        anyEscapes(outcome.result.metricRanges) &&
        windowRetries < 1
      ) {
        windowRetries++;
        windows = windowsFromObserved(
          outcome.result.metricRanges,
          windows,
          bins,
          1 / 64,
        );
        outcome = await executeAttempt(config.runCount, windows);
        continue;
      }
      break;
    }

    if (isDisposed()) {
      return;
    }
    if (!outcome.ok) {
      fail(outcome.reason);
      return;
    }
    if (outcome.result.overflowRuns > 0 && !outcome.result.cancelled) {
      fail(
        "Token counts kept outgrowing their derived capacities even after growth; run this experiment on the CPU, which sizes its buffers dynamically.",
      );
      return;
    }
    // The batch's final calibration — grown slabs, replanned windows — is
    // the best knowledge for the next batch on this marking.
    if (!outcome.result.cancelled) {
      storeCalibration(windows);
    }

    if (anyEscapes(outcome.result.metricRanges) && !outcome.result.cancelled) {
      // Unreachable when the recalibrated re-run executed (same seeds, same
      // trajectories, exact observed range) — kept as the honest safety net.
      config.onWarning?.(
        "Some samples fell outside the histogram's calibrated range, so the distribution's edges are clamped.",
      );
    }

    // Chunks already streamed most frames; the final decode is the
    // authoritative set (it trims trailing empty frames), so it replaces
    // rather than appends.
    metrics.set(
      appendMetricFrames(
        createEmptyMetricsState(),
        toGpuMetricFrames(
          [...initialHistogramFrames, ...outcome.result.frames],
          config.metricSpecs,
          config.dt,
        ),
      ),
    );
    progress.set({
      activeRuns: 0,
      advancedRuns: config.runCount,
      allFinished: !outcome.result.cancelled,
      completedRuns: outcome.result.completedRuns,
      erroredRuns: 0,
      frameNumber: frameLimit,
      runCount: config.runCount,
      time: frameLimit * config.dt,
    });

    finish(outcome.result.cancelled ? "cancelled" : "complete");
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
