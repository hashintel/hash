/**
 * Public surface for `@hashintel/petrinaut-core`: the headless engine.
 *
 * No React, no DOM, no Monaco. Stateful handles, streams, and pure logic for
 * SDCPN documents, simulation, LSP, and playback, and an in-browser
 * optimization runtime (Optuna under Pyodide in a worker).
 *
 * @layerRoot core
 * @role The headless engine: document model, compiler, simulation runtimes and LSP, with no UI framework. Its own files are the package entries a host or the editor imports
 */

// One section per block, and each header names the block's layer. A block
// with no entry file of its own has its section here as its public interface.

// --- Document types: core.types ---
export type * from "./types/sdcpn";

// --- Document helpers: core.document ---
export { parseArcId } from "./document/selection";
export type * from "./document/selection";
export {
  ARC_ID_PREFIX,
  ARC_ID_SEPARATOR,
  generateArcId,
  type ArcIdPrefix,
} from "./document/arc-id";
export {
  canonicalizeArcId,
  canonicalizePetrinautIds,
  generatePetrinautId,
  isPetrinautId,
  petrinautIdSchema,
  toPetrinautId,
} from "./document/petrinaut-id";
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
  getComponentPortEndpointComponent,
  parseArcEndpointKey,
  placeArcEndpoint,
} from "./document/arc-endpoints";
export {
  isSupportedArity,
  MAX_DIFFERENTIAL_EQUATION_ARITY,
} from "./document/equation-arity";
export {
  getPlaceDynamicsEquationIds,
  placeUsesDifferentialEquation,
} from "./document/place-dynamics";
export { GRID_SIZE } from "./document/grid-size";
export {
  type DefaultParameterValues,
  deriveDefaultParameterValues,
  getParameterValueError,
  mergeParameterValues,
  parseParameterValue,
  resolveNetParameterValues,
} from "./document/parameter-values";
export { isSDCPNEqual } from "./document/deep-equal";
export {
  hashPetrinautDocument,
  petrinautNonSemanticParts,
  type HashPetrinautDocumentOptions,
  type PetrinautNonSemanticPart,
} from "./document/hash-petrinaut-document";
export { getNodeConnections } from "./document/get-connections";

// --- Entity schemas: core.schemas ---
export {
  describeDisallowedComponentIconElement,
  disallowedComponentIconElement,
  maxComponentIconLength,
} from "./schemas/entity-schemas";

// --- File format: core.file-format ---
export { normalizeSDCPN } from "./file-format/sdcpn-input";
export { migrateLegacyComponentKeys } from "./file-format/legacy/migrate-legacy-component-keys";
export type {
  SDCPNInput,
  SDCPNInputArcInput,
  SDCPNOutputArcInput,
  SDCPNPlaceInput,
  SDCPNTransitionInput,
} from "./file-format/sdcpn-input";
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

// --- Document handle: core.handle ---
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

// --- Stores and event streams: core.store ---
export { createReadableStore, type ReadableStore } from "./store";
export type { EventStream } from "./store";

// --- Worker and abort shapes: core.environment ---
export type {
  AbortSignalLike,
  WorkerFactoryLike,
  WorkerLike,
} from "./environment/environment";

// --- Extensions and net class: core.extensions ---
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
} from "./extensions/extensions";
export type {
  PetrinautExtension,
  PetrinautExtensionSettings,
  PetrinautHandleCapabilities,
  ResolvedPetrinautHandleCapabilities,
  TransitionLogicAvailability,
} from "./extensions/extensions";
export {
  netColoringOf,
  netTimeOf,
  runClockOf,
  runContinuityOf,
  type NetChance,
  type NetClass,
  type NetColoring,
  type NetTime,
  type RunClock,
  type RunContinuity,
} from "./extensions/net-class";

// --- Token value model: core.tokens ---
export {
  coerceTokenAttributeValue,
  coerceTokenRecord,
  coerceToStoredTokenAttributeValue,
  defaultTokenAttributeValue,
  encodeTokenAttributeValue,
} from "./tokens/token-values";
export {
  COLOR_ELEMENT_TYPES,
  TYPE_POLICIES,
  type StoredTokenAttributeValue,
  type TypePolicy,
} from "./tokens/type-policies";
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
} from "./tokens/token-layout";
export { StringPool } from "./tokens/string-pool";
export {
  formatUuid,
  isUuidString,
  NIL_UUID,
  parseUuid,
  PETRINAUT_UUID_NAMESPACE,
  toUuid,
} from "./tokens/uuid";

// --- Document editing, mutations and commands: core.actions ---
export {
  createPetrinautActions,
  updatePrunesReferences,
} from "./actions/actions";
export type {
  CreatePetrinautActionsOptions,
  MutationHelperFunctions,
} from "./actions/actions";
export { createPetrinautCommands } from "./actions/commands";
export type {
  ApplyAutoLayoutResult,
  ApplyClipboardPasteResult,
  CommandHelperFunctions,
} from "./actions/commands";
export {
  aiCommandActionInputSchemas,
  commandActionInputSchemas,
} from "./actions/command-schemas";
export type {
  AiCommandActionInput,
  AiCommandActionName,
  CommandActionInput,
  CommandActionName,
} from "./actions/command-schemas";
export { mutationActionInputSchemas } from "./actions/action-schemas";
export {
  DEFAULT_DIFFERENTIAL_EQUATION_CODE,
  DEFAULT_TRANSITION_KERNEL_CODE,
  DEFAULT_VISUALIZER_CODE,
  generateDefaultDifferentialEquationCode,
  generateDefaultLambdaCode,
  generateDefaultTransitionKernelCode,
  generateDefaultVisualizerCode,
} from "./actions/default-codes";

// --- Instance: core.instance ---
export { createPetrinaut } from "./instance/instance";
export type {
  CreatePetrinautConfig,
  Petrinaut,
  PetrinautCommands,
  PetrinautMutations,
} from "./instance/instance";
export { composesOnly, sameRules } from "./instance/host-rules";
export type { PetrinautRules } from "./instance/host-rules";

// --- Composition: core.composition ---
export {
  describeFusionMember,
  findFusionWithMember,
  fusionAnchor,
  fusionHub,
  resolveFusionMember,
} from "./composition/fusions";
export type { FusionNet, ResolvedFusionMember } from "./composition/fusions";
export { checkFusion, fusionCheckPass } from "./composition/check-fusions";
export type {
  FusionCheckPass,
  FusionProblem,
  FusionProblemCode,
  ProblemSeverity,
} from "./composition/check-fusions";
export type { PortProblem } from "./composition/check-ports";
export { checkComposition } from "./composition/check-composition";
export type { CompositionProblem } from "./composition/check-composition";
export type { ImportProblem } from "./composition/check-imports";
export {
  checkInterfaces,
  implementationsOf,
} from "./composition/check-interfaces";
export type {
  InterfaceProblem,
  InterfaceProblemCode,
} from "./composition/check-interfaces";
export {
  componentKey,
  defaultImplementation,
  describeUnboundInstance,
  hasBody,
  implementsInterface,
  indexById,
  indexDocument,
  isInterface,
  resolveComponent,
  resolveImplementation,
  sameComponent,
} from "./composition/interfaces";
export type {
  DocumentIndex,
  ImplementationBinding,
} from "./composition/interfaces";
export {
  describeImports,
  isResolvingImports,
  resolvedLibraries,
} from "./composition/imports";
export { inlineImports } from "./composition/inline-imports";
export type {
  ImportState,
  ImportStates,
  ImportSummary,
  LibraryComponentSummary,
  ResolveImport,
} from "./composition/imports";
export { resolveLibrary } from "./composition/libraries";
export type {
  Library,
  LibraryComponent,
  LibraryComponentBody,
  LibraryParameter,
  LibraryPort,
  LibraryTokenType,
  ResolvedLibraries,
  ResolvedLibrary,
} from "./composition/libraries";
export {
  describePortDirection,
  effectivePortDirection,
  effectivePortDirections,
  inferPortDirection,
  portDirections,
} from "./composition/ports";

// --- Scenarios: core.scenario ---
export {
  compileScenario,
  prepareScenarioCompiler,
  type CompiledPlaceMarking,
  type CompiledScenarioResult,
  type CompileScenarioOptions,
  type CompileScenarioOutcome,
  type ScenarioCompilationError,
  type ScenarioParameterValues,
} from "./scenario/compile-scenario";

// --- Ad-hoc scenarios: core.scenario.ad-hoc ---
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
  createAdHocPlaceTotalResolver,
  createAdHocTargetLabeler,
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
} from "./scenario/ad-hoc/ad-hoc-scenario";
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
} from "./scenario/ad-hoc/ad-hoc-actions";
export {
  CLASSIC_RUN_ROW_CAP,
  classicRunParameterValues,
  classicRunVariables,
  classicScenarioRunState,
  initialMarkingToAdHocPlaces,
  type TruncatedPlace,
} from "./scenario/ad-hoc/materialize-run-state";
export {
  adHocStateFromScenario,
  type AdHocStateFromScenario,
} from "./scenario/ad-hoc/scenario-to-ad-hoc-state";
export { adHocScenarioStateSchema } from "./scenario/ad-hoc/ad-hoc-state-schema";
export { runSandboxed, SHADOWED_GLOBALS } from "./scenario/ad-hoc/sandbox";

// --- HIR: core.hir ---
// Type-only from the main entry: the compiler itself stays in the LSP worker,
// runtime instantiation in ./hir-runtime.
export type {
  CompileHirArtifactsOptions,
  HirArtifacts,
  HirCompileFailure,
  HirCompileResult,
  HirDiagnostic,
  HirMetricArtifact,
} from "./hir";
// Type-only: lowering itself needs the TypeScript compiler and stays in the
// LSP worker (`requestScenarioHir`) / Node (`lowerScenarioToHir` in ./hir).
export type {
  ScenarioHir,
  ScenarioHirItem,
  ScenarioLoweringInput,
} from "./hir/scenario";
export {
  HirInterpretError,
  interpretHir,
  type HirInterpretBindings,
  type HirValue,
} from "./hir/interpret";
export {
  buildVisualizerContext,
  type HirVisualizerContext,
} from "./hir/surface-context";
export { hirFunctionSchema } from "./hir/hir-schema";
export type { MetricShape } from "./hir/metric-shape";

// --- Constraints: core.constraints ---
export {
  CONSTRAINT_SPACES,
  CONSTRAINT_SURFACES,
  constraintLabel,
  constraintListSchema,
  constraintSchema,
  constraintSpaceSchema,
  constraintsInSpace,
  parameterConstraintSchema,
  stateConstraintSchema,
} from "./constraints/constraint";
export type {
  Constraint,
  ConstraintSpace,
  ParameterConstraint,
  StateConstraint,
} from "./constraints/constraint";
export {
  compileStateConstraintIndicator,
  wrapHirAsIndicator,
} from "./constraints/indicator-metric";
export {
  constraintMargin,
  evaluateParameterConstraints,
  type ParameterConstraintResult,
} from "./constraints/margin";
// Type-only: lowering itself stays in ./hir (worker/Node).
export type {
  ConstraintSource,
  LowerConstraintContext,
  LowerConstraintResult,
} from "./constraints/lower";

// --- View HIR: core.view-hir ---
// The view HIR a visualizer lowers to, and what its renderer may draw. The
// lowering stays in the worker (`requestVisualizerHir`, see ./view-hir);
// interpretation and rendering happen here, in the editor, through the
// modules of ./view-hir that carry no compiler.
export type { VisualizerHir } from "./view-hir/visualizer";
export type { ViewHir, ViewNode } from "./view-hir/view-hir";
export { VIEW_FRAGMENT_TAG } from "./view-hir/view-hir";
export {
  interpretViewHir,
  ViewElementValue,
  type ViewProps,
  type ViewValue,
} from "./view-hir/interpret-view";
export {
  isSafeViewValue,
  VIEW_ELEMENT_ATTRIBUTES,
  VIEW_ELEMENT_TAGS,
  VIEW_LEGACY_STYLE_PROPERTIES,
  VIEW_STYLE_PROPERTIES,
} from "./view-hir/view-elements";
export {
  visualizerSvgTag,
  visualizerSvgAttributes,
  parseVisualizerSvgOptions,
  type VisualizerSvgOptions,
} from "./view-hir/visualizer-svg";

// --- LSP: core.lsp ---
export {
  CompletionItemKind,
  CompletionItemTag,
  createLanguageClient,
  createWorkerLspTransport,
  DiagnosticSeverity,
  DiagnosticTag,
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
  NetAnalysis,
  SignatureHelp,
  TextDocumentIdentifier,
} from "./lsp";
export {
  getDocumentUri,
  getAdHocDocumentUri,
  getConstraintDocumentUri,
  getMetricDocumentUri,
  getScenarioDocumentUri,
  parseAdHocDocumentUri,
  parseConstraintDocumentUri,
  parseDocumentUri,
} from "./lsp/document-uris";

// --- Simulation: core.simulation ---
// simulation/index.ts carries the contract and Monte Carlo together: one
// statement for their values, one for their types.
export {
  PETRINAUT_DEFAULT_SEED,
  addAllMonteCarloMetricValues,
  createMonteCarloExperiment,
  createMonteCarloMetricHistogramAccumulator,
  createMonteCarloMetricNumericAccumulator,
  createMonteCarloSimulator,
  createMonteCarloUserDefinedMetricConfigsFromSpecs,
  createMonteCarloUserDefinedMetric,
  getDefaultMonteCarloShardCount,
  createWorkerTransport,
  deriveRunSeed,
} from "./simulation";
export type {
  CreateMonteCarloExperimentConfig,
  SimulationFrameRawView,
  SimulationFrameReader,
  SimulationFrameState,
  SimulationState,
  SimulationTransport,
  WorkerFactory,
  InitialMarking,
  InitialPlaceMarking,
  InitialTokenAttributeValue,
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
export { SDCPNItemError } from "./simulation/sdcpn-item-error";

// --- Frames: core.simulation.frames ---
export { createHirMetricEvaluator } from "./simulation/frames/hir-metric";

// --- Event trace (experimental): core.simulation.event-trace ---
export {
  ADAPTIVE_SIMULATOR_ID,
  FIXED_STEP_SIMULATOR_ID,
  SOLVER_ERROR_DIAGNOSTIC,
} from "./simulation/event-trace";
export type {
  EventSimulation,
  EventSimulationEvent,
} from "./simulation/event-trace";

// --- Execution trace (experimental): core.execution-trace ---
export {
  createExecutionTrace,
  createTraceEncoder,
  createTracePlayer,
  effectivePlayMode,
  EVENT_PLAY_MODE_LEAD,
  findRestingTime,
  findStepTargetIndex,
  wallClockMsAt,
} from "./execution-trace";
export type {
  ExecutionTrace,
  ExecutionTraceConfig,
  PlayableTrace,
  TraceCoverage,
  TraceEncoder,
  TraceEvent,
  TraceEventKind,
  TraceFiring,
  TraceMarking,
  TracePlayer,
  TracePlayerLoadOptions,
  TracePlayerSnapshot,
  TraceToken,
  TraceWriter,
} from "./execution-trace";

// --- Simulators (experimental): core.simulators ---
export {
  assessSimulator,
  createExperimentReader,
  createJsAdaptiveSimulator,
  createJsFixedStepSimulator,
  createWebGpuFixedStepSimulator,
  DEFAULT_EXPERIMENT_SAMPLE_PERIOD,
  defaultSimulatorParameters,
  defineSimulator,
  experimentBackendOfSimulator,
  experimentSamplePeriod,
  placeCountMetricId,
  placeCountMetricSpecs,
  resolveSimulatorParameters,
  simulatorFromExperimentBackend,
  simulatorSamplePeriod,
  WEBGPU_FIXED_STEP_SIMULATOR_ID,
} from "./simulators";
export type {
  CountStatistics,
  ExperimentBackendStepping,
  ExperimentReader,
  JsSimulatorOptions,
  ResolvedSimulatorParameters,
  SimulationRequest,
  SimulationRequestBase,
  Simulator,
  SimulatorAssessment,
  SimulatorExperimentRequest,
  SimulatorImplementation,
  SimulatorManifest,
  SimulatorOffer,
  SimulatorParameterProblem,
  SimulatorParameterSpec,
  SimulatorParameterSpecs,
  SimulatorParameterValues,
  SimulatorProducts,
  SimulatorRegistration,
  SimulatorSelectionOutcome,
  SimulatorStart,
  SimulatorStartOptions,
  StoredSimulatorParameters,
  WebGpuFixedStepSimulatorOptions,
} from "./simulators";

// --- Experiment backends: core.experiments ---
export {
  petrinautExperimentRequestSchema,
  petrinautExperimentResultSchema,
  type PetrinautExperimentHost,
  type PetrinautExperimentProgress,
  type PetrinautExperimentRequest,
  type PetrinautExperimentResult,
} from "./experiments";

// --- WebGPU: core.webgpu ---
// Dependency-free WebGPU capability check. The backend itself lives behind the
// `./webgpu` entry point, which bundles the HIR frontend and must not reach UI.
export { isWebGpuAvailable } from "./webgpu/support";

// --- Optimization: core.optimization ---
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
  petrinautOptimizationExecutionSchema,
  petrinautOptimizationFixedBindingSchema,
  petrinautOptimizationEventSchema,
  petrinautOptimizationInputSchema,
  petrinautOptimizationManifestSchema,
  petrinautOptimizationObjectiveSchema,
  petrinautOptimizationParameterBindingSchema,
  petrinautOptimizationStartedEventSchema,
  petrinautOptimizationStudySchema,
  petrinautOptimizationTrialEventSchema,
  petrinautOptimizationVariableBindingSchema,
} from "./optimization";
export type {
  PetrinautBooleanOptimizationDomain,
  PetrinautContinuousOptimizationDomain,
  PetrinautOptimizationDomain,
  PetrinautOptimizationEvent,
  PetrinautOptimizationExecution,
  PetrinautOptimizationInput,
  PetrinautOptimizationDirection,
  PetrinautOptimizationManifest,
  PetrinautOptimizationObjective,
  PetrinautOptimizationParameterBinding,
  PetrinautOptimizationDescribeParameter,
  PetrinautOptimizationDescribeResult,
  PetrinautOptimizationStudy,
  PetrinautOptimizationTrialConstraints,
  PetrinautOptimizationTrialEvent,
  PetrinautOptimizationImportances,
  PetrinautOptimizationConstraintPolicy,
  PetrinautIntegerOptimizationDomain,
} from "./optimization";

// --- Playback: core.playback ---
export {
  createPlayback,
  formatPlaybackSpeed,
  PLAYBACK_SPEEDS,
} from "./playback";
export type {
  Playback,
  ComputePlayMode,
  PlaybackSnapshot,
  PlaybackSpeed,
  PlaybackState,
  PlayMode,
  TickInput,
  TickResult,
} from "./playback";

// --- Actual mode: core.actual-mode ---
export {
  ACTUAL_MODE_RECORDING_VERSION,
  actualModeMarkingSchema,
  actualModeRecordingSchema,
  actualModeSourceSchema,
  actualModeTransitionEffectSchema,
  actualModeTransitionFiringSchema,
  applyActualModeTransitionFiring,
  createActualModeRecording,
  createActualModeTrace,
  getActualModeEpochMs,
  parseActualModeRecording,
  retimeActualModeRecordingForReplay,
  unavailableActualMode,
} from "./actual-mode";
export type {
  ActualModeContextValue,
  ActualModeMarking,
  ActualModeRecording,
  ActualModeSource,
  ActualModeTokenColour,
  ActualModeTrace,
  ActualModeTransitionEffect,
  ActualModeTransitionFiring,
} from "./actual-mode";

// --- Layout: core.layout ---
export {
  calculateGraphLayout,
  classicNodeDimensions,
  compactNodeDimensions,
  componentInstanceFooterHeight,
  componentInstanceHeaderHeight,
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

// --- Clipboard: core.clipboard ---
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

// --- Command registry, palette commands: core.command-registry ---
export {
  combineCommandRegistries,
  createCommandRegistry,
} from "./command-registry/command-registry";
export type {
  Command,
  CommandRegistry,
  CommandRegistryView,
} from "./command-registry/command-registry";

// --- Validation: core.validation ---
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

// --- AI prompt and tool schemas, also the `./ai` entry: core ---
export {
  colorSchema,
  componentInstanceSchema,
  componentSchema,
  createExperimentToolName,
  differentialEquationSchema,
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
  metricSchema,
  parameterSchema,
  petrinautAiCapabilitySections,
  petrinautAiCommandTools,
  petrinautAiMutationTools,
  petrinautAiTools,
  petrinautDiagnosticsContextMessageId,
  petrinautDocNames,
  petrinautDocSummaries,
  placeSchema,
  readPetrinautDocToolInputSchema,
  readPetrinautDocToolName,
  scenarioSchema,
  setNetTitleToolInputSchema,
  setNetTitleToolName,
  transitionSchema,
} from "./ai";
export type {
  PetrinautAiCommandToolInput,
  PetrinautAiCommandToolName,
  PetrinautAiTool,
  PetrinautAiToolInput,
  PetrinautAiMutationToolInput,
  PetrinautAiMutationToolName,
  PetrinautAiToolName,
  PetrinautAiTools,
  PetrinautDocName,
} from "./ai";
