/** Dynamically import and instantiate the simulation worker (inlined as blob URL). */
export async function createSimulationWorker(): Promise<Worker> {
  const SimulationWorker = await import("./simulation.worker.ts?worker&inline");
  // eslint-disable-next-line new-cap
  return new SimulationWorker.default();
}
