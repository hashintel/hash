/**
 * @layerRoot core.simulation.simulators
 * @role Declares what a simulator is to a host: a manifest with its parameters, an assessment of a request, and the single runs and experiments it starts
 *
 * A simulator computes a net one way: a fixed step in JS, a fixed step on
 * the GPU, an error-controlled solver. This layer is the contract they
 * share and the registrations of the built-in ones. It sits above the
 * runtimes it starts: the event simulation for a single run and the Monte
 * Carlo experiment for many, neither of which knows about it.
 */

export {
  defaultSimulatorParameters,
  resolveSimulatorParameters,
} from "./parameters";
export type {
  ResolvedSimulatorParameters,
  SimulatorParameterProblem,
  SimulatorParameterSpec,
  SimulatorParameterSpecs,
  SimulatorParameterValues,
  StoredSimulatorParameters,
} from "./parameters";
export { assessSimulator, defineSimulator } from "./simulator";
export type {
  SimulationRequest,
  SimulationRequestBase,
  Simulator,
  SimulatorAssessment,
  SimulatorExperimentRequest,
  SimulatorImplementation,
  SimulatorManifest,
  SimulatorOffer,
  SimulatorProducts,
  SimulatorRegistration,
  SimulatorSelectionOutcome,
  SimulatorStart,
  SimulatorStartOptions,
} from "./simulator";
export {
  DEFAULT_EXPERIMENT_SAMPLE_PERIOD,
  simulatorFromExperimentBackend,
} from "./experiment-backend-simulator";
export type { ExperimentBackendStepping } from "./experiment-backend-simulator";
export {
  experimentBackendOfSimulator,
  simulatorSamplePeriod,
} from "./simulator-experiment-backend";
export {
  createExperimentReader,
  placeCountMetricId,
  placeCountMetricSpecs,
} from "./experiment-reader";
export type { CountStatistics, ExperimentReader } from "./experiment-reader";
export {
  builtInSimulatorManifests,
  createJsAdaptiveSimulator,
  createJsFixedStepSimulator,
  createWebGpuFixedStepSimulator,
  jsAdaptiveSimulatorManifest,
  jsFixedStepSimulatorManifest,
  WEBGPU_FIXED_STEP_SIMULATOR_ID,
  webGpuFixedStepSimulatorManifest,
} from "./built-in";
export type {
  JsSimulatorOptions,
  WebGpuFixedStepSimulatorOptions,
} from "./built-in";
