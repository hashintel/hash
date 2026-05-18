// Public surface for `@hashintel/petrinaut-core` — the headless engine.
//
// No React, no DOM, no Monaco. Stateful handles, streams, and pure logic for
// SDCPN documents, simulation, LSP, and playback.

// --- Document ---
export {
  createJsonDocHandle,
  type CreateJsonDocHandleOptions,
  type DocChangeEvent,
  type DocHandleState,
  type DocumentId,
  type HistoryEntry,
  type PetrinautDocHandle,
  type PetrinautHistory,
  type PetrinautPatch,
  type ReadableStore,
} from "./handle";

// --- Instance ---
export { createPetrinaut } from "./instance";
export type {
  CreatePetrinautConfig,
  EventStream,
  Petrinaut,
} from "./instance";
export { createPetrinautActions } from "./actions";
export type { MutationHelperFunctions } from "./actions";

// --- AI ---
export {
  colorSchema,
  createPetrinautMutationAiToolCallbacks,
  differentialEquationSchema,
  getLatestNetDefinitionToolName,
  metricSchema,
  parameterSchema,
  petrinautAiMutationTools,
  petrinautAiPrompt,
  petrinautAiTools,
  placeSchema,
  scenarioSchema,
  transitionSchema,
} from "./ai";
export type {
  PetrinautAiTool,
  PetrinautMutationAiToolCallbacks,
  PetrinautAiToolInput,
  PetrinautAiMutationToolInput,
  PetrinautAiMutationToolName,
  PetrinautAiToolName,
  PetrinautAiTools,
} from "./ai";

// --- Simulation ---
export {
  createMonteCarloExperiment,
  createMonteCarloSimulator,
  createMonteCarloWorker,
  createPlaceTokenCountDistributionMetric,
  createSimulation,
  createWorkerTransport,
} from "./simulation";
export type {
  BackpressureConfig,
  CreateMonteCarloExperimentConfig,
  CreateSimulationConfig,
  Simulation,
  SimulationCompleteEvent,
  SimulationConfig,
  SimulationErrorEvent,
  SimulationEvent,
  SimulationFrameReader,
  SimulationFrameState,
  SimulationFrameSummary,
  SimulationPlaceTokenValues,
  SimulationState,
  SimulationTransport,
  WorkerFactory,
  InitialMarking,
  MonteCarloAdvanceResult,
  MonteCarloActiveRunPlaceCountsVisitor,
  MonteCarloExperiment,
  MonteCarloExperimentDistributions,
  MonteCarloExperimentEvent,
  MonteCarloExperimentState,
  MonteCarloFrameMetric,
  MonteCarloFrameMetricContext,
  MonteCarloRunConfig,
  MonteCarloRunSnapshot,
  MonteCarloRunStatus,
  MonteCarloRunSummary,
  MonteCarloRunUntilCompleteOptions,
  MonteCarloSimulator,
  MonteCarloSimulatorConfig,
  PlaceTokenCountDistributionBin,
  PlaceTokenCountDistributionFrame,
  PlaceTokenCountDistributionMetric,
  PlaceTokenCountDistributionPlace,
  MonteCarloWorkerProgress,
} from "./simulation";

// --- LSP ---
export {
  createLanguageClient,
  createWorkerLspTransport,
} from "./lsp";
export type {
  CreateLanguageClientConfig,
  DiagnosticsSnapshot,
  LanguageClient,
  LspTransport,
  LspWorkerFactory,
} from "./lsp";

// --- Playback ---
export {
  createPlayback,
  formatPlaybackSpeed,
  getPlayModeBackpressure,
  PLAYBACK_SPEEDS,
} from "./playback";
export type {
  Playback,
  ComputePlayMode,
  PlaybackSnapshot,
  PlaybackSpeed,
  PlaybackState,
  PlayMode,
  PlayModeBackpressure,
  TickInput,
  TickResult,
} from "./playback";

// --- Domain types ---
export type {
  Color,
  DifferentialEquation,
  ID,
  MinimalNetMetadata,
  MutateSDCPN,
  Parameter,
  Place,
  SDCPN,
  Transition,
} from "./types/sdcpn";

// --- Pure utilities ---
export { GRID_SIZE } from "./grid-size";
export {
  type DefaultParameterValues,
  deriveDefaultParameterValues,
  mergeParameterValues,
} from "./parameter-values";
export { SDCPNItemError } from "./errors";
