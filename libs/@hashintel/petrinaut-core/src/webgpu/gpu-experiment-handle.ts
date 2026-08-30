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
import { GPU_HISTOGRAM_BINS } from "./compile-net-shader";
import { toGpuMetricFrames, toGpuMetricSpecs } from "./gpu-metric-frames";
import { runGpuExperiment } from "./runner";

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
   */
  runs?: readonly MonteCarloRunConfig[];
  /** Defaults to RK4 — see `backend.ts` for why that is not Euler. */
  odeMethod?: GpuOdeMethod;
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
  runCount: number,
): DerivedRunParameters {
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

  const runParameters = deriveRunParameters(config.runs, config.runCount);
  if (!runParameters.ok) {
    return {
      supported: false,
      cause: "net-unsupported",
      reason: runParameters.reason,
    };
  }

  const backend = await requestGpuExperimentBackend({
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
  if (!backend.supported) {
    return {
      supported: false,
      cause: backend.cause,
      reason: backend.reason,
    };
  }

  // The CPU's rounding: snap within an epsilon of a whole step, else ceil
  // (`monte-carlo/time.ts`), so both backends step the same frame count.
  const frameLimit = Math.max(1, getMaxFrameNumber(config.maxTime, config.dt));
  const status = createReadableStore<MonteCarloExperimentState>("Initializing");
  const progress = createReadableStore<MonteCarloWorkerProgress | null>(null);
  const metrics = createReadableStore(createEmptyMetricsState());
  const events = createEventStream<MonteCarloExperimentEvent>();

  let disposed = false;
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

  const run = async () => {
    // A marking larger than a typed place's declared capacity has nowhere to
    // go: the slots are sized from the capacity, and writing past them would
    // corrupt the neighbouring place's tokens or the next run's header. The
    // CPU engine grows its buffers dynamically, so the net still runs there.
    for (const place of backend.profile.places) {
      const marking = config.initialMarking[place.id];
      const count = Array.isArray(marking)
        ? marking.length
        : typeof marking === "number"
          ? marking
          : 0;
      if (place.capacity > 0 && count > place.capacity) {
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

    const outcome = await runGpuExperiment(backend.handle, backend.shader, {
      runCount: config.runCount,
      frameLimit,
      framesPerDispatch: backend.framesPerDispatch,
      seed: config.seed,
      initial: { placeCounts, placeTokenWords },
      onFrames: (chunkFrames) => {
        if (disposed) {
          return;
        }
        metrics.set(
          appendMetricFrames(
            metrics.get(),
            toGpuMetricFrames(chunkFrames, config.metricSpecs, config.dt),
          ),
        );
      },
      ...(runParameters.values === undefined
        ? {}
        : { runParameterValues: runParameters.values }),
      signal,
      onChunk: ({ framesDone }) => {
        if (disposed) {
          return;
        }
        progress.set({
          activeRuns: config.runCount,
          advancedRuns: config.runCount,
          allFinished: false,
          completedRuns: 0,
          erroredRuns: 0,
          frameNumber: framesDone,
          runCount: config.runCount,
          time: framesDone * config.dt,
        });
      },
    });

    if (disposed) {
      return;
    }
    if (!outcome.ok) {
      fail(outcome.reason);
      return;
    }

    if (outcome.result.saturatedSamples > 0) {
      // The top bin saturates, so the distribution is wrong above it. Saying so
      // beats presenting a clipped distribution as a result.
      config.onWarning?.(
        `${outcome.result.saturatedSamples} samples reached the histogram's largest bin (${GPU_HISTOGRAM_BINS - 1} tokens) and were clamped there, so values above it are not accurate. Run on the CPU for an exact distribution.`,
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
      backend.handle.device.destroy();
    },
  };

  return {
    supported: true,
    handle,
    deviceInfo: backend.handle.info,
    warnings: backend.warnings,
  };
}
