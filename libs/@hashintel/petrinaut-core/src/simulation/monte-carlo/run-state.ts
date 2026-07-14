/* eslint-disable no-param-reassign -- Monte Carlo run state owns mutable frame buffers. */
import { buildSimulation } from "../engine/build-simulation";
import { readEngineFrame } from "../frames/internal-frame";
import {
  cloneMonteCarloFrameBuffer,
  copyEngineFrameViewToMonteCarloFrameBuffer,
  createMonteCarloFrameBuffer,
  type MonteCarloFrameBuffer,
} from "./frame-buffer";
import { getFrameTime, getMaxFrameNumber } from "./time";

import type { MonteCarloRunState } from "./internal-types";
import type {
  MonteCarloAdvanceResult,
  MonteCarloRunConfig,
  MonteCarloRunSnapshot,
  MonteCarloRunSummary,
  MonteCarloSimulatorConfig,
} from "./types";

/**
 * Derives a deterministic seed for a run when the caller did not provide an
 * explicit per-run seed.
 *
 * This keeps runs reproducible while avoiding identical RNG streams across the
 * default run set.
 */
function deriveRunSeed(baseSeed: number, runIndex: number): number {
  return (
    Math.abs(Math.trunc(baseSeed + (runIndex + 1) * 2_654_435_761)) %
    2_147_483_648
  );
}

/**
 * Ensures a frame has enough token byte capacity.
 *
 * If the frame is too small, this allocates a replacement with 2x growth,
 * copies existing state, rewires the owning run's current/next frame pointer,
 * and records the reallocation.
 */
export function ensureFrameCapacity(
  run: MonteCarloRunState,
  frame: MonteCarloFrameBuffer,
  requiredTokenByteCount: number,
): MonteCarloFrameBuffer {
  if (frame.tokenByteCapacity >= requiredTokenByteCount) {
    return frame;
  }

  const nextCapacity = Math.max(
    requiredTokenByteCount,
    frame.tokenByteCapacity * 2,
    64,
  );
  const resizedFrame = cloneMonteCarloFrameBuffer(
    run.simulation.frameLayout,
    frame,
    nextCapacity,
  );

  if (run.currentFrame === frame) {
    run.currentFrame = resizedFrame;
  } else if (run.nextFrame === frame) {
    run.nextFrame = resizedFrame;
  }

  run.reallocations++;
  return resizedFrame;
}

/**
 * Builds one independent Monte Carlo run.
 *
 * Each run gets its own compiled simulation instance, RNG state, current frame,
 * and next frame. The engine's retained frame history is cleared after copying
 * the initial frame into the reusable Monte Carlo buffer format.
 */
export function createRunState(
  config: MonteCarloSimulatorConfig,
  runConfig: MonteCarloRunConfig | undefined,
  index: number,
): MonteCarloRunState {
  const seed = runConfig?.seed ?? deriveRunSeed(config.seed ?? 1, index);
  const initialMarking = runConfig?.initialMarking ?? config.initialMarking;
  const inputParameterValues = {
    ...config.parameterValues,
    ...runConfig?.parameterValues,
  };
  const simulation = buildSimulation({
    sdcpn: config.sdcpn,
    extensions: config.extensions,
    initialMarking,
    parameterValues: inputParameterValues,
    seed,
    dt: config.dt,
    maxTime: config.maxTime,
    hirArtifacts: config.hirArtifacts,
  });
  const initialFrame = simulation.frames[0];
  if (!initialFrame) {
    throw new Error("Monte Carlo simulation initialization produced no frame");
  }

  const initialView = readEngineFrame(simulation.frameLayout, initialFrame);
  const initialTokenByteCount = initialView.tokenBytes.byteLength;
  const initialCapacity = Math.max(
    config.initialTokenByteCapacity ?? initialTokenByteCount,
    initialTokenByteCount,
  );
  const currentFrame = createMonteCarloFrameBuffer(
    simulation.frameLayout,
    initialCapacity,
  );
  copyEngineFrameViewToMonteCarloFrameBuffer(
    simulation.frameLayout,
    initialView,
    currentFrame,
    simulation.dt,
  );

  return {
    index,
    status: "ready",
    seed,
    simulation: {
      ...simulation,
      frames: [],
      currentFrameNumber: 0,
    },
    currentFrame,
    nextFrame: createMonteCarloFrameBuffer(
      simulation.frameLayout,
      initialCapacity,
    ),
    initialMarking,
    parameterValues: simulation.parameterValues,
    frameNumber: 0,
    maxFrameNumber: getMaxFrameNumber(config.maxTime, config.dt),
    rngState: seed,
    completionReason: null,
    error: null,
    reallocations: 0,
  };
}

/**
 * Creates a lightweight summary of one run without exposing its frame buffer.
 *
 * This is the stable public read model for progress, completion, capacity, and
 * error reporting.
 */
export function summarizeRun(run: MonteCarloRunState): MonteCarloRunSummary {
  return {
    index: run.index,
    status: run.status,
    seed: run.seed,
    frameNumber: run.frameNumber,
    currentTime: getFrameTime(run.frameNumber, run.simulation.dt),
    rngState: run.rngState,
    parameterValues: run.parameterValues,
    completionReason: run.completionReason,
    error: run.error,
    tokenByteCount: run.currentFrame.tokenByteCount,
    tokenByteCapacity: run.currentFrame.tokenByteCapacity,
    reallocations: run.reallocations,
  };
}

/**
 * Aggregates run statuses after advancing a batch of runs.
 *
 * `advancedRuns` is supplied by the caller because only the stepping loop knows
 * how many runs actually produced a new frame in that batch.
 */
export function summarizeRuns(
  simulationRuns: readonly MonteCarloRunState[],
  advancedRuns: number,
): MonteCarloAdvanceResult {
  let completedRuns = 0;
  let erroredRuns = 0;
  let activeRuns = 0;

  for (const run of simulationRuns) {
    if (run.status === "complete") {
      completedRuns++;
    } else if (run.status === "error") {
      erroredRuns++;
    } else {
      activeRuns++;
    }
  }

  return {
    advancedRuns,
    completedRuns,
    erroredRuns,
    activeRuns,
    allFinished: activeRuns === 0,
  };
}

/**
 * Creates an inspection snapshot for one run.
 *
 * The snapshot exposes place token counts but still keeps the underlying
 * current frame buffer private to the core simulation layer.
 */
export function getRunSnapshot(run: MonteCarloRunState): MonteCarloRunSnapshot {
  const placeTokenCounts: Record<string, number> = {};
  for (
    let placeIndex = 0;
    placeIndex < run.simulation.frameLayout.placeIds.length;
    placeIndex++
  ) {
    placeTokenCounts[run.simulation.frameLayout.placeIds[placeIndex]!] =
      run.currentFrame.placeCounts[placeIndex] ?? 0;
  }

  return {
    ...summarizeRun(run),
    placeTokenCounts,
  };
}
