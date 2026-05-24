import type { WorkerLike } from "../../../environment";

/** Dynamically import and instantiate the Monte Carlo worker. */
export async function createMonteCarloWorker(): Promise<WorkerLike> {
  const MonteCarloWorker = await import("./monte-carlo.worker.ts?worker&inline");
  // eslint-disable-next-line new-cap
  return new MonteCarloWorker.default();
}
