/**
 * Public surface for `@hashintel/petrinaut-core` — the headless engine.
 *
 * No React, no DOM, no Monaco. Stateful handles, streams, and pure logic for
 * SDCPN documents, simulation, LSP, and playback.
 *
 * @layerRoot core
 * @role SDCPN document model, compiler, simulation runtimes and LSP, with no UI framework
 */

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

// --- Command registry (palette commands) ---
export {
  combineCommandRegistries,
  createCommandRegistry,
} from "./command-registry/command-registry";
export type {
  Command,
  CommandRegistry,
  CommandRegistryView,
} from "./command-registry/command-registry";

// --- Instance ---
export { createPetrinaut } from "./instance";
export type {
  CreatePetrinautConfig,
  EventStream,
  Petrinaut,
  PetrinautCommands,
  PetrinautMutations,
} from "./instance";
export {
  PETRINAUT_OPTIMIZATION_CANCELLED_ERROR_CODE,
  PETRINAUT_OPTIMIZATION_MAX_SEED,
  PETRINAUT_OPTIMIZATION_MAX_SEEDS_PER_TRIAL,
  PETRINAUT_OPTIMIZATION_MAX_STEPS_PER_TRIAL,
  PETRINAUT_OPTIMIZATION_MAX_TOTAL_STEPS,
  PETRINAUT_OPTIMIZATION_MAX_TRIALS,
  petrinautBooleanOptimizationDomainSchema,
  petrinautContinuousOptimizationDomainSchema,
  petrinautIntegerOptimizationDomainSchema,
  petrinautOptimizationCompleteEventSchema,
  petrinautOptimizationDescribeParameterSchema,
  petrinautOptimizationDescribeResultSchema,
  petrinautOptimizationDomainSchema,
  petrinautOptimizationErrorEventSchema,
  petrinautOptimizationEvaluateParamsSchema,
  petrinautOptimizationExecutionSchema,
  petrinautOptimizationFixedBindingSchema,
  petrinautOptimizationEventSchema,
  petrinautOptimizationConstraintSchema,
  petrinautOptimizationConstraintsSchema,
  petrinautOptimizationInputSchema,
  petrinautOptimizationManifestSchema,
  petrinautOptimizationObjectiveSchema,
  petrinautOptimizationParameterBindingSchema,
  petrinautOptimizationReplicateSchema,
  petrinautOptimizationEvaluateResultSchema,
  petrinautOptimizationStartedEventSchema,
  petrinautOptimizationStudySchema,
  petrinautOptimizationTrialEventSchema,
  petrinautOptimizationVariableBindingSchema,
} from "./optimization";
export type {
  PetrinautOptimization,
  PetrinautBooleanOptimizationDomain,
  PetrinautContinuousOptimizationDomain,
  PetrinautOptimizationDomain,
  PetrinautOptimizationEvaluateParams,
  PetrinautOptimizationEvaluateResult,
  PetrinautOptimizationEvent,
  PetrinautOptimizationExecution,
  PetrinautOptimizationConstraint,
  PetrinautOptimizationConstraints,
  PetrinautOptimizationInput,
  PetrinautOptimizationManifest,
  PetrinautOptimizationObjective,
  PetrinautOptimizationParameterBinding,
  PetrinautOptimizationDescribeParameter,
  PetrinautOptimizationDescribeResult,
  PetrinautOptimizationStudy,
  PetrinautOptimizationTrialEvent,
  PetrinautIntegerOptimizationDomain,
} from "./optimization";
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
  classicNodeDimensions,
  compactNodeDimensions,
  getBoundsOfCenteredBoxes,
  getComponentInstanceHeight,
  getMinZoomForBounds,
  layoutNodeDimensions,
  type LayoutDimensions,
  type NodeDimensions,
  type NodePosition,
  type Rect,
  type RenderNodeDimensions,
  type Size,
  ZOOM_PADDING,
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
  PETRINAUT_DEFAULT_SEED,
  addAllMonteCarloMetricValues,
  createMonteCarloExperiment,
  runExperimentToCompletion,
  createMonteCarloMetricHistogramAccumulator,
  createMonteCarloMetricNumericAccumulator,
  createMonteCarloSimulator,
  createMonteCarloUserDefinedMetricConfigsFromSpecs,
  createMonteCarloUserDefinedMetric,
  getDefaultMonteCarloShardCount,
  createSimulation,
  createWorkerTransport,
  deriveRunSeed,
} from "./simulation";
// Dependency-free WebGPU capability check. The backend itself lives behind the
// `./webgpu` entry point, which bundles the HIR frontend and must not reach UI.
export { isWebGpuAvailable } from "./webgpu/support";
export type {
  BackpressureConfig,
  CreateMonteCarloExperimentConfig,
  CreateSimulationConfig,
  Simulation,
  SimulationCompleteEvent,
  SimulationConfig,
  SimulationErrorEvent,
  SimulationEvent,
  SimulationFrameRawView,
  SimulationFrameReader,
  SimulationFrameState,
  SimulationFrameSummary,
  SimulationState,
  SimulationTransport,
  WorkerFactory,
  InitialMarking,
  InitialPlaceMarking,
  InitialTokenAttributeValue,
  MonteCarloAdvanceResult,
  MonteCarloActiveRunPlaceCountsVisitor,
  MonteCarloExperiment,
  ExperimentCompletion,
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
  MonteCarloUserDefinedMetricBinExtent,
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

// --- HIR (type-only from the main entry; the compiler itself stays in the
// LSP worker, runtime instantiation in ./hir-runtime) ---
export type {
  CompileHirArtifactsOptions,
  HirArtifacts,
  HirCompileFailure,
  HirCompileResult,
  HirDiagnostic,
  HirMetricArtifact,
} from "./hir";

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
export { normalizeSDCPN } from "./types/sdcpn-input";
export type {
  SDCPNInput,
  SDCPNInputArcInput,
  SDCPNOutputArcInput,
  SDCPNPlaceInput,
  SDCPNTransitionInput,
} from "./types/sdcpn-input";
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
  getParameterValueError,
  mergeParameterValues,
  parseParameterValue,
  resolveNetParameterValues,
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
  compileScenario,
  prepareScenarioCompiler,
  type CompiledPlaceMarking,
  type CompiledScenarioResult,
  type CompileScenarioOptions,
  type CompileScenarioOutcome,
  type ScenarioCompilationError,
  type ScenarioParameterValues,
} from "./simulation/authoring/scenario/compile-scenario";
// Type-only: lowering itself needs the TypeScript compiler and stays in the
// LSP worker (`requestScenarioHir`) / Node (`lowerScenarioToHir` in ./hir).
export type {
  ScenarioHir,
  ScenarioHirItem,
  ScenarioLoweringInput,
} from "./hir/scenario";
// Type-only: lowering itself stays in ./hir (worker/Node).
export type {
  LowerOptimizationConstraintContext,
  LowerOptimizationConstraintResult,
  OptimizationConstraintSpace,
} from "./hir/constraint";
export {
  AD_HOC_DEFAULT_OPTIMIZE,
  AD_HOC_DEFAULT_COUNT_OPTIMIZE,
  adHocOptimizationBindings,
  adHocExposedParameterIdentifier,
  adHocParameterName,
  adHocPlaceKey,
  adHocSlotKey,
  adHocTargetLabel,
  adHocRowKindOf,
  cycleAdHocRowKind,
  setAdHocRowKind,
  adHocNeutralExpression,
  resolveAdHocPlaceTotal,
  shareAdHocColumn,
  synthesizeAdHocOptimization,
  synthesizeAdHocScenario,
  toggleAdHocOptimize,
  unshareAdHocColumn,
  type AdHocColouredPlace,
  type AdHocRow,
  type AdHocRowKind,
  type AdHocNetParameter,
  type AdHocOptimizedField,
  type AdHocOptimizeSettings,
  type AdHocPlaceState,
  type AdHocPlaceTotal,
  type AdHocScenarioState,
  type AdHocSlot,
  type AdHocSynthesisContext,
  type AdHocSynthesisError,
  type AdHocSynthesisOutput,
  type AdHocUncolouredPlace,
  type AdHocValue,
  type AdHocValuePart,
  type AdHocValueTarget,
  type AdHocVariable,
  type SynthesizeAdHocOptimizationOutcome,
  type SynthesizeAdHocScenarioOutcome,
} from "./simulation/authoring/scenario/ad-hoc/ad-hoc-scenario";
export {
  adHocActionCoalescingKey,
  adHocActionInputSchemas,
  adHocPlaceStateFor,
  adHocValueTargetSchema,
  applyAdHocAction,
  cloneAdHocScenarioState,
  defaultAdHocCellsFor,
  EMPTY_AD_HOC_STATE,
  emptyAdHocValue,
  newAdHocVariable,
  rewriteAdHocReference,
  type AdHocAction,
  type AdHocActionInput,
  type AdHocActionName,
} from "./simulation/authoring/scenario/ad-hoc/ad-hoc-actions";
export {
  CLASSIC_RUN_ROW_CAP,
  classicRunParameterValues,
  classicRunVariables,
  classicScenarioRunState,
  initialMarkingToAdHocPlaces,
  type TruncatedPlace,
} from "./simulation/authoring/scenario/ad-hoc/materialize-run-state";
export { adHocScenarioStateSchema } from "./simulation/authoring/scenario/ad-hoc/ad-hoc-state-schema";
export { createHirMetricEvaluator } from "./simulation/frames/hir-metric";
export {
  coerceTokenAttributeValue,
  coerceTokenRecord,
  coerceToStoredTokenAttributeValue,
  defaultTokenAttributeValue,
  encodeTokenAttributeValue,
} from "./simulation/engine/token-values";
export {
  COLOR_ELEMENT_TYPES,
  TYPE_POLICIES,
  type StoredTokenAttributeValue,
  type TypePolicy,
} from "./simulation/engine/type-policies";
export {
  computeTokenSlotLayout,
  createTokenRegionViews,
  encodeTokenToBytes,
  readTokenRecord,
  type PhysicalKind,
  type StringPoolReader,
  type StringPoolWriter,
  type TokenLayoutField,
  type TokenRegionViews,
  type TokenSlotLayout,
} from "./simulation/engine/token-layout";
export { StringPool } from "./simulation/engine/string-pool";
export {
  formatUuid,
  isUuidString,
  NIL_UUID,
  parseUuid,
  PETRINAUT_UUID_NAMESPACE,
  toUuid,
} from "./simulation/engine/uuid";
export {
  displayNameSchema,
  validateDisplayName,
} from "./validation/display-name";
export { entityNameSchema, validateEntityName } from "./validation/entity-name";
export {
  cloneUserKeyedRecord,
  createUserKeyedRecord,
  DANGEROUS_RECORD_KEYS,
  describeDangerousSdcpnKeys,
  findDangerousSdcpnKeys,
  getOwn,
  isDangerousRecordKey,
  type DangerousSdcpnKey,
} from "./validation/record-keys";
export { validateVariableName } from "./validation/variable-name";
export { runSandboxed, SHADOWED_GLOBALS } from "./simulation/authoring/sandbox";

// --- File, clipboard, and editor protocol helpers ---
export {
  parseDocumentText,
  serializeDocument,
  type DocumentFormat,
  type ParseDocumentTextResult,
} from "./file-format/document-text";
export {
  parseSDCPNDocument,
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
  getAdHocDocumentUri,
  getMetricDocumentUri,
  getScenarioDocumentUri,
  parseAdHocDocumentUri,
  parseDocumentUri,
} from "./lsp/lib/document-uris";
