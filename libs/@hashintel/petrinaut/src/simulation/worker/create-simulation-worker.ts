/** Dynamically import and instantiate the simulation worker as an emitted asset. */
export async function createSimulationWorker(): Promise<Worker> {
  const SimulationWorker = await import("./simulation.worker.ts?worker");
  // eslint-disable-next-line new-cap
  return new SimulationWorker.default();
}
