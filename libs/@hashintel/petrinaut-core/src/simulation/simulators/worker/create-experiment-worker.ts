import type { WorkerLike } from "../../../environment";

/** Dynamically import and instantiate the Monte Carlo worker (inlined as a blob URL). */
export async function createMonteCarloWorker(): Promise<WorkerLike> {
  const ExperimentWorker = await import("./experiment.worker.ts?worker&inline");
  // eslint-disable-next-line new-cap
  return new ExperimentWorker.default();
}
