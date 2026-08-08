/**
 * Swappable experiment backends.
 *
 * The runtime half of swappability already existed and is unchanged: both the
 * worker-pool and WebGPU paths produce a `MonteCarloExperiment`, and consumers
 * drive one with no branching. What this adds is the part that was hardcoded —
 * asking a backend whether it can run a net, and choosing between backends when
 * one declines.
 *
 * Backends are constructed with their own wiring (a worker factory, an ODE
 * method) and then registered as data, which is what makes a React context
 * provider a small step from here rather than a redesign: the provider builds the
 * backends its environment supports and publishes the registration list.
 *
 * Registration carries a deferred `load`, so a heavy backend can be registered
 * without pulling its implementation into a bundle that never uses it — it is
 * imported the first time selection reaches it.
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
