import type { WorkerLike } from "../../../environment";

/** Dynamically import and instantiate the event simulation worker (inlined as a blob URL). */
export async function createEventSimulationWorker(): Promise<WorkerLike> {
  const EventSimulationWorker =
    await import("./event-simulation.worker.ts?worker&inline");
  // eslint-disable-next-line new-cap
  return new EventSimulationWorker.default();
}
