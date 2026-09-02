import {
  createWorkerPoolExperimentBackend,
  WORKER_POOL_BACKEND_ID,
} from "@hashintel/petrinaut-core/experiments";

import type {
  ExperimentBackend,
  ReusableWorkerFactory,
} from "@hashintel/petrinaut-core/experiments";

export type BatchLane =
  /** Walk the backend registrations; the winner becomes the chosen backend. */
  | { kind: "select" }
  /** A CPU lane of its own, beside whatever the navigator uses. */
  | { kind: "cpu"; width: "narrow" | "wide" }
  /** The backend the first batch chose. */
  | { kind: "chosen"; backend: ExperimentBackend };

/**
 * Decides where a sweep batch runs.
 *
 * The navigator's own batches walk the backend selection once and then reuse
 * the chosen backend. A background batch never joins that walk — two batches
 * contending for the pool would both patch the record's backend fields — so
 * it takes a CPU lane until a backend is chosen, and stays there when the
 * choice lands on the CPU or when its consumer reads per-run values, which
 * only the CPU workers report. The lane is narrow while the navigator's
 * ladder computes on the CPU pool and wide once the ladder idles or computes
 * on the GPU.
 */
export const decideBatchLane = ({
  background,
  requiresRunResults,
  foregroundActive,
  chosenBackend,
}: {
  background: boolean;
  requiresRunResults: boolean;
  foregroundActive: boolean;
  chosenBackend: ExperimentBackend | null;
}): BatchLane => {
  const chosenCpu =
    chosenBackend === null || chosenBackend.id === WORKER_POOL_BACKEND_ID;
  if (background && (chosenBackend === null || requiresRunResults)) {
    return {
      kind: "cpu",
      width: foregroundActive && chosenCpu ? "narrow" : "wide",
    };
  }
  if (chosenBackend === null) {
    return { kind: "select" };
  }
  if (background && chosenCpu) {
    return { kind: "cpu", width: "narrow" };
  }
  return { kind: "chosen", backend: chosenBackend };
};

export type CpuLanes = {
  lane: (width: "narrow" | "wide") => ExperimentBackend;
};

/**
 * The two CPU lanes background batches use, built on first use so a sweep
 * whose surface view never opens spawns nothing extra. Narrow is one worker.
 * Wide is a third of the pool: the surface runs three chunks at once, so
 * the wide lanes together fill the pool instead of tripling it.
 */
export const createCpuLanes = ({
  createWorker,
  shardCount,
}: {
  createWorker: ReusableWorkerFactory;
  shardCount: number;
}): CpuLanes => {
  const lanes = new Map<"narrow" | "wide", ExperimentBackend>();
  return {
    lane: (width) => {
      let lane = lanes.get(width);
      if (lane === undefined) {
        lane = createWorkerPoolExperimentBackend({
          createWorker,
          shardCount:
            width === "narrow" ? 1 : Math.max(2, Math.floor(shardCount / 3)),
        });
        lanes.set(width, lane);
      }
      return lane;
    },
  };
};
