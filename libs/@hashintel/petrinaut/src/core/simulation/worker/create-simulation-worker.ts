/** Dynamically import and instantiate the simulation worker (inlined as blob URL). */
export async function createSimulationWorker(): Promise<Worker> {
  // eslint-disable-next-line no-console
  console.log("[sim] default createSimulationWorker invoked — importing");
  const SimulationWorker = await import("./simulation.worker.ts?worker&inline");
  // eslint-disable-next-line no-console
  console.log("[sim] default createSimulationWorker — constructing", {
    hasDefault: typeof SimulationWorker.default,
  });
  // eslint-disable-next-line new-cap
  return new SimulationWorker.default();
}
