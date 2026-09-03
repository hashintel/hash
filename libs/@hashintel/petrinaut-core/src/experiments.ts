/**
 * The contract every compute backend satisfies, the selection that picks one,
 * and the worker pool the CPU backend leases from.
 *
 * A backend is constructed with its own wiring (a worker factory, an ODE
 * method) and registered as data, so a host builds the backends its
 * environment supports and publishes the list. Registration carries a
 * deferred `load`: a heavy backend is imported the first time selection
 * reaches it and stays out of bundles that never use it.
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
export type {
  ExperimentRequest,
  ExperimentRunPlan,
} from "./experiments/experiment-request";
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
export {
  createReusableWorkerFactory,
  type ReusableWorkerFactory,
} from "./simulation/monte-carlo/runtime/reusable-worker-factory";
