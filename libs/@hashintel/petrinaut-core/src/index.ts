// Public surface for `@hashintel/petrinaut-core` — the headless engine.
//
// No React, no DOM, no Monaco. Stateful handles, streams, and pure logic for
// SDCPN documents, simulation, LSP, and playback.

// --- Document ---
export {
  ACTUAL_MODE_RECORDING_VERSION,
  ACTUAL_MODE_TIMELINE_TICK_MS,
  actualModeMarkingSchema,
  actualModeRecordingSchema,
  actualModeSourceSchema,
  actualModeTransitionEffectSchema,
  actualModeTransitionFiringSchema,
  applyActualModeTransitionFiring,
  buildActualModeTimelinePoints,
  createActualModeRecording,
  createActualModeReceivedEventsRecording,
  createActualModeTimelineFrameReader,
  getActualModeMarkingAtTransitionFiringIndex,
  getActualModeTransitionFiringTimesMs,
  parseActualModeRecording,
  retimeActualModeRecordingForReplay,
  unavailableActualMode,
} from "./actual-mode";
export type {
  ActualModeContextValue,
  ActualModeMarking,
  ActualModeReceivedEvent,
  ActualModeReceivedEventsRecording,
  ActualModeRecording,
  ActualModeSource,
  ActualModeTimelinePoint,
  ActualModeTimelinePointKind,
  ActualModeTokenColour,
  ActualModeTransitionEffect,
  ActualModeTransitionFiring,
} from "./actual-mode";
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
} from "./handle";
export type { ReadableStore } from "./store";
export {
  DEFAULT_PETRINAUT_EXTENSIONS,
  PETRINAUT_EXTENSION_NAMES,
  createArcPlaceResolver,
  getEffectiveTransitionLambdaType,
  getTransitionLogicAvailability,
  hasTypedNonInhibitorInputPlace,
  isTransitionKernelAvailable,
  isTransitionLambdaAvailable,
  isSelectionTypeAvailableForExtensions,
  resolvePetrinautHandleCapabilities,
  sanitizeSDCPNForExtensions,
} from "./extensions";
export type {
  PetrinautExtension,
  PetrinautExtensionSettings,
  PetrinautHandleCapabilities,
  ResolvedPetrinautHandleCapabilities,
  TransitionLogicAvailability,
} from "./extensions";

// --- Instance ---
export { createPetrinaut } from "./instance";
export type {
  CreatePetrinautConfig,
  EventStream,
  Petrinaut,
  PetrinautCommands,
  PetrinautMutations,
} from "./instance";
export { createPetrinautActions } from "./actions";
export type {
  CreatePetrinautActionsOptions,
  MutationHelperFunctions,
} from "./actions";
export { createPetrinautCommands } from "./commands";
export type {
  ApplyAutoLayoutResult,
  ApplyClipboardPasteResult,
  CommandHelperFunctions,
} from "./commands";
export {
  aiCommandActionInputSchemas,
  commandActionInputSchemas,
} from "./command-schemas";
export type {
  AiCommandActionInput,
  AiCommandActionName,
  CommandActionInput,
  CommandActionName,
} from "./command-schemas";
export { mutationActionInputSchemas } from "./action-schemas";
export {
  calculateGraphLayout,
  layoutNodeDimensions,
  type LayoutDimensions,
  type NodePosition,
} from "./layout";

// --- AI ---
export {
  colorSchema,
  componentInstanceSchema,
  createPetrinautAiWritableCallbacks,
  differentialEquationSchema,
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
  metricSchema,
  parameterSchema,
  petrinautAiCommandTools,
  petrinautAiMutationTools,
  petrinautAiPrompt,
  petrinautAiTools,
  petrinautDocNames,
  petrinautDocSummaries,
  placeSchema,
  readPetrinautDocToolInputSchema,
  readPetrinautDocToolName,
  scenarioSchema,
  setNetTitleToolInputSchema,
  setNetTitleToolName,
  subnetSchema,
  transitionSchema,
} from "./ai";
export type {
  PetrinautAiCommandToolInput,
  PetrinautAiCommandToolName,
  PetrinautAiTool,
  PetrinautAiWritableCallbacks,
  PetrinautAiToolInput,
  PetrinautAiMutationToolInput,
  PetrinautAiMutationToolName,
  PetrinautAiToolName,
  PetrinautAiTools,
  PetrinautDocName,
} from "./ai";

// --- Simulation ---
export {
  addAllMonteCarloMetricValues,
  createMonteCarloExperiment,
  createMonteCarloMetricHistogramAccumulator,
  createMonteCarloMetricNumericAccumulator,
  createMonteCarloSimulator,
  createMonteCarloUserDefinedMetricConfigsFromSpecs,
  createMonteCarloUserDefinedMetric,
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
  SimulationState,
  SimulationTransport,
  WorkerFactory,
  InitialMarking,
  InitialPlaceMarking,
  MonteCarloAdvanceResult,
  MonteCarloActiveRunPlaceCountsVisitor,
  MonteCarloExperiment,
  MonteCarloExperimentEvent,
  MonteCarloExperimentMetrics,
  MonteCarloExperimentState,
  MonteCarloExpressionMetricSpec,
  MonteCarloFrameMetric,
  MonteCarloFrameMetricContext,
  MonteCarloMetricDistributionBinning,
  MonteCarloMetricHistogramAccumulatorState,
  MonteCarloMetricMonoid,
  MonteCarloMetricNumericAccumulatorState,
  MonteCarloMetricSpec,
  MonteCarloMetricSpecBase,
  MonteCarloMetricRunOutput,
  MonteCarloMetricRunStatus,
  MonteCarloMetricValueAccumulator,
  MonteCarloPlaceTokenCountMeanMetricSpec,
  MonteCarloRunFrameMetricView,
  MonteCarloRunFrameMetricVisitor,
  MonteCarloRunConfig,
  MonteCarloRunSnapshot,
  MonteCarloRunStatus,
  MonteCarloRunSummary,
  MonteCarloRunUntilCompleteOptions,
  MonteCarloSimulator,
  MonteCarloSimulatorConfig,
  MonteCarloUserDefinedMetric,
  MonteCarloUserDefinedMetricAggregation,
  MonteCarloUserDefinedMetricConfig,
  MonteCarloUserDefinedDistributionMetricFrame,
  MonteCarloUserDefinedMetricDistributionBin,
  MonteCarloUserDefinedMetricFrame,
  MonteCarloUserDefinedMetricMeasureInput,
  MonteCarloUserDefinedMetricSampleRuns,
  MonteCarloUserDefinedScalarMetricFrame,
  MonteCarloUserDefinedMetricTimeAggregation,
  MonteCarloTransitionFiringCountMetricSpec,
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
export type {
  AbortSignalLike,
  WorkerFactoryLike,
  WorkerLike,
} from "./environment";
export {
  ARC_ID_PREFIX,
  ARC_ID_SEPARATOR,
  generateArcId,
  type ArcIdPrefix,
} from "./arc-id";
export {
  arcEndpointsEqual,
  arcMatchesEndpoint,
  arcReferencesComponentInstance,
  arcReferencesPlace,
  componentPortArcEndpoint,
  createArcEndpointReference,
  getArcEndpoint,
  getArcEndpointKey,
  getArcEndpointNodeId,
  getArcEndpointPlaceId,
  getComponentPortEndpointSubnet,
  parseArcEndpointKey,
  placeArcEndpoint,
} from "./arc-endpoints";
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
export {
  coerceTokenAttributeValue,
  coerceTokenRecord,
  defaultTokenAttributeValue,
  encodeTokenAttributeValue,
} from "./simulation/engine/token-values";
export {
  computeTokenSlotLayout,
  createTokenRegionViews,
  encodeTokenToBytes,
  readTokenRecord,
  type PhysicalKind,
  type TokenLayoutField,
  type TokenSlotLayout,
} from "./simulation/engine/token-layout";
export { compileUserCode } from "./simulation/authoring/user-code/compile-user-code";
export {
  displayNameSchema,
  validateDisplayName,
} from "./validation/display-name";
export { entityNameSchema, validateEntityName } from "./validation/entity-name";
export { validateVariableName } from "./validation/variable-name";

// --- File, clipboard, and editor protocol helpers ---
export {
  parseSDCPNFile,
  type ImportResult,
} from "./file-format/parse-sdcpn-file";
export { serializeSDCPN } from "./file-format/serialize-sdcpn";
export { sdcpnToTikZ } from "./file-format/sdcpn-to-tikz";
export { pastePayloadIntoSDCPN } from "./clipboard/paste";
export {
  parseClipboardPayload,
  serializeSelection,
} from "./clipboard/serialize";
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
