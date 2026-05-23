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
export type { CreatePetrinautConfig, EventStream, Petrinaut } from "./instance";
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
  InitialPlaceMarking,
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
  CompletionItemKind,
  createLanguageClient,
  createWorkerLspTransport,
  DiagnosticSeverity,
  MarkupKind,
  Position,
  Range,
} from "./lsp";
export type {
  CompletionItem,
  CompletionList,
  CreateLanguageClientConfig,
  Diagnostic,
  DiagnosticsSnapshot,
  DocumentUri,
  Hover,
  LanguageClient,
  LspTransport,
  LspWorkerFactory,
  MarkupContent,
  SignatureHelp,
  TextDocumentIdentifier,
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
export type * from "./types/sdcpn";
export { parseArcId } from "./types/selection";
export type * from "./types/selection";

// --- Pure utilities ---
export type { AbortSignalLike, WorkerFactoryLike, WorkerLike } from "./environment";
export { ARC_ID_PREFIX, ARC_ID_SEPARATOR, generateArcId, type ArcIdPrefix } from "./arc-id";
export { GRID_SIZE } from "./grid-size";
export {
  type DefaultParameterValues,
  deriveDefaultParameterValues,
  mergeParameterValues,
} from "./parameter-values";
export { SDCPNItemError } from "./errors";
export { isSDCPNEqual } from "./lib/deep-equal";
export { getNodeConnections } from "./lib/get-connections";

// --- Authoring helpers ---
export {
  DEFAULT_DIFFERENTIAL_EQUATION_CODE,
  DEFAULT_TRANSITION_KERNEL_CODE,
  DEFAULT_VISUALIZER_CODE,
  generateDefaultDifferentialEquationCode,
  generateDefaultLambdaCode,
  generateDefaultTransitionKernelCode,
  generateDefaultVisualizerCode,
} from "./default-codes";
export {
  compileMetric,
  type CompiledMetric,
  type CompileMetricOutcome,
  type MetricPlaceState,
  type MetricState,
} from "./simulation/authoring/metric/compile-metric";
export {
  compileScenario,
  type CompiledPlaceMarking,
  type CompiledScenarioResult,
  type CompileScenarioOptions,
  type CompileScenarioOutcome,
  type ScenarioCompilationError,
  type ScenarioParameterValues,
} from "./simulation/authoring/scenario/compile-scenario";
export { buildMetricState } from "./simulation/frames/metric-state";
export { displayNameSchema, validateDisplayName } from "./validation/display-name";
export { entityNameSchema, validateEntityName } from "./validation/entity-name";
export { validateVariableName } from "./validation/variable-name";

// --- File, clipboard, and editor protocol helpers ---
export { parseSDCPNFile, type ImportResult } from "./file-format/parse-sdcpn-file";
export { serializeSDCPN } from "./file-format/serialize-sdcpn";
export { sdcpnToTikZ } from "./file-format/sdcpn-to-tikz";
export { pastePayloadIntoSDCPN } from "./clipboard/paste";
export { parseClipboardPayload, serializeSelection } from "./clipboard/serialize";
export {
  CLIPBOARD_FORMAT_VERSION,
  clipboardPayloadSchema,
  type ClipboardPayload,
} from "./clipboard/types";
export {
  getDocumentUri,
  getMetricDocumentUri,
  getScenarioDocumentUri,
  parseDocumentUri,
} from "./lsp/lib/document-uris";
