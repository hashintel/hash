/**
 * Public surface for `@hashintel/petrinaut` — the host-facing entry point.
 *
 * Re-exports the handful of contexts and types a host needs to embed the editor
 * and inject its own capabilities (error tracking, optimization, slots). The
 * editor itself is reached through `/ui`, and the React bindings through
 * `/react`.
 *
 * @layerRoot petrinaut
 * @role The host-facing entry point: the contexts and types an embedder wires up
 */

export type { ErrorTracker } from "./react/error-tracker-context";
export { ErrorTrackerContext } from "./react/error-tracker-context";
export type { PetrinautOptimization } from "./react/optimization-context";
export { PetrinautOptimizationContext } from "./react/optimization-context";

export type { PetrinautSlots } from "./ui/types/petrinaut-slots";
export type { ViewportAction } from "./ui/types/viewport-action";
export type {
  PetrinautAiComposerControl,
  PetrinautAiComposerControlContext,
  PetrinautAiComposerStatus,
  PetrinautAiComposerSubmitTextResult,
} from "./ui/types/ai-assistant-composer-control";
export type {
  PetrinautNavigationAction,
  PetrinautNavigationController,
  PetrinautNavigationHistory,
  PetrinautNavigationHistoryPolicy,
  PetrinautNavigationIntent,
  PetrinautNavigationOverlay,
  PetrinautNavigationState,
  PetrinautNavigationUpdate,
  PetrinautNavigationUpdater,
  PetrinautSimulateResource,
} from "./react/navigation";
export { definePetrinautAiInteractiveTool } from "./ui/types/ai-interactive-tool";
export type {
  PetrinautAiInteractiveTool,
  PetrinautAiInteractiveToolDefinition,
  PetrinautAiInteractiveToolSchema,
  PetrinautAiInteractiveToolWidgetProps,
} from "./ui/types/ai-interactive-tool";

export {
  createJsonDocHandle,
  createPetrinaut,
  createPetrinautActions,
  createSimulation,
  createWorkerTransport,
  isSDCPNEqual,
  type BackpressureConfig,
  type Color,
  type CreateJsonDocHandleOptions,
  type CreatePetrinautConfig,
  type CreateSimulationConfig,
  type DifferentialEquation,
  type DocChangeEvent,
  type DocHandleState,
  type DocumentId,
  type EventStream,
  type HistoryEntry,
  type MinimalNetMetadata,
  type MutateSDCPN,
  type MutationHelperFunctions,
  type Parameter,
  type PetrinautDocHandle,
  type PetrinautExtension,
  type PetrinautExtensionSettings,
  type PetrinautHandleCapabilities,
  type PetrinautHistory,
  type Petrinaut as PetrinautInstance,
  type PetrinautPatch,
  type Place,
  type ReadableStore,
  type InitialMarking,
  type SDCPN,
  type Simulation,
  type SimulationCompleteEvent,
  type SimulationConfig,
  type SimulationErrorEvent,
  type SimulationEvent,
  type SimulationFrameReader,
  type SimulationFrameState,
  type SimulationFrameSummary,
  type SimulationState,
  type SimulationTransport,
  type Transition,
  type WorkerFactory,
} from "@hashintel/petrinaut-core";
export { Petrinaut } from "./ui/petrinaut";
export type {
  PetrinautAiAssistant,
  PetrinautAiChatTransport,
  PetrinautProps,
} from "./ui/petrinaut";
