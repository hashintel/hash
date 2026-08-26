import { createWorkerThreadRuntime } from "../../../environment";
import { attachMonteCarloWorker } from "./attach";

attachMonteCarloWorker(createWorkerThreadRuntime());
