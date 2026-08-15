/**
 * The contract every experiment backend satisfies.
 *
 * @layerRoot core.experiments
 * @role Chooses a compute backend for an experiment, and asks whether it can run a net
 *
 * Small. Both paths already produce a `MonteCarloExperiment` that
 * `ExperimentsProvider` consumes without branching. This adds only what was
 * never abstracted: choosing a backend, and asking whether it can take a net.
 *
 * Backend-specific configuration is bound when the backend object is built, not
 * passed through this interface. The worker-pool backend closes over a worker
 * factory and a shard count; the WebGPU backend closes over an ODE method. That
 * is why a shared config type is unnecessary, and it is also exactly the shape a
 * React context provider wants later: the provider constructs backends with the
 * environment's wiring and publishes the resulting list.
 */
import type {
  ExperimentAssessment,
  ExperimentBlockerOrigin,
} from "./experiment-assessment";
import type { ExperimentRequest } from "./experiment-request";

export type ExperimentBackend = {
  /**
   * Stable identifier, recorded against results.
   *
   * Results from two backends are not numerically interchangeable, they use
   * different random generators, so which one ran is part of the data, not a
   * detail.
   */
  readonly id: string;
  /** Shown to users, e.g. "CPU (Web Workers)". */
  readonly label: string;
  /**
   * Whether this backend needs the lowered HIR *trees* on the artifacts.
   *
   * Declared rather than inferred from the id so a caller compiles once for the
   * backends it is about to ask. The trees roughly triple artifact size, so the
   * worker-pool backend does not want them; the WebGPU backend cannot generate a
   * shader without them.
   */
  readonly needsHirTrees: boolean;
  /**
   * Whether this backend could run *anything* in this environment.
   *
   * Synchronous and cheap, a feature test, not an assessment, so a UI can
   * decide whether to offer the backend at all without compiling a net. A
   * backend that is always usable returns `true`.
   */
  isAvailable(this: void): boolean;
  /**
   * Decides whether this backend can run `request`, without starting it.
   *
   * Asynchronous because deciding can require real work (lowering a net,
   * generating and compiling a shader). Must not acquire scarce resources: that
   * belongs to `instantiate` on the eligible result, so that assessing a net
   * while the user edits does not hold a GPU device.
   */
  assess(this: void, request: ExperimentRequest): Promise<ExperimentAssessment>;
};

/**
 * A backend plus how eagerly to load it.
 *
 * `load` is deferred so a caller can register the WebGPU backend without pulling
 * the shader generator into the initial bundle, it is imported the first time a
 * GPU run is actually attempted. Both backends are registered at once; the choice
 * is per experiment, never global.
 */
export type ExperimentBackendRegistration = {
  readonly id: string;
  readonly label: string;
  /**
   * Loads the backend. Keep it cheap and side-effect free: the selection walk
   * calls it once per walk, so anything expensive a backend acquires (a worker
   * pool, a GPU device) belongs in `instantiate`, not here.
   */
  load(this: void): Promise<ExperimentBackend>;
};

/** Why no backend could run the request. */
export type ExperimentSelectionFailure = {
  readonly backendId: string;
  readonly origin: ExperimentBlockerOrigin;
  readonly reason: string;
};
