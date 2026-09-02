/**
 * The contract both compute backends satisfy, and the registry that picks one.
 *
 * Backends already produce a `MonteCarloExperiment` that consumers drive without
 * branching. This adds the two things that were hardcoded: asking a backend
 * whether it can run a net, and choosing when one declines.
 *
 * A backend is constructed with its own wiring (a worker factory, an ODE method)
 * and registered as data. A React context provider can therefore build the
 * backends its environment supports and publish the list.
 *
 * Registration carries a deferred `load`. A heavy backend is imported the first
 * time selection reaches it, so it stays out of bundles that never use it.
 */
export type {
  ExperimentAssessment,
  ExperimentBlocker,
  ExperimentBlockerOrigin,
  ExperimentBlockers,
  ExperimentInstantiation,
  ExperimentNote,
  InstantiateExperimentOptions,
} from "./experiments/experiment-assessment";
export type {
  ExperimentBackend,
  ExperimentBackendRegistration,
  ExperimentSelectionFailure,
} from "./experiments/experiment-backend";
export type { ExperimentRequest } from "./experiments/experiment-request";
export {
  selectExperimentBackend,
  type SelectExperimentBackendInput,
  type SelectExperimentBackendResult,
} from "./experiments/select-experiment-backend";
export {
  createWorkerPoolExperimentBackend,
  WORKER_POOL_BACKEND_ID,
  type WorkerPoolExperimentBackendOptions,
} from "./experiments/worker-pool-experiment-backend";
