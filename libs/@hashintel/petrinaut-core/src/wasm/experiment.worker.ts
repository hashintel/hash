import { createWorkerThreadRuntime } from "../environment";
import { attachMonteCarloWorker } from "../simulation/monte-carlo/worker/attach";
import { createWasmSimulation } from "./simulator";

attachMonteCarloWorker(createWorkerThreadRuntime(), createWasmSimulation);
