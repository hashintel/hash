/**
 * Public surface for `@hashintel/petrinaut` — the host-facing entry point.
 *
 * Re-exports the editor and the contexts and types a host needs to embed it and
 * inject its own capabilities (error tracking, optimization, slots). The React
 * bindings live in `/react`, and the plugin API in `/ui/plugin`.
 *
 * @layerRoot petrinaut
 * @role The host-facing entry point: the contexts and types an embedder wires up
 */

export type {
  ErrorTracker,
  ErrorTrackerCaptureContext,
} from "./react/error-tracker-context";
export { ErrorTrackerContext } from "./react/error-tracker-context";
export type {
  PetrinautConnectedOptimization,
  PetrinautConnectedOptimizationCapability,
  PetrinautConnectedRunOptions,
  PetrinautOptimization,
  PetrinautOptimizationChannel,
  PetrinautOptimizationSource,
} from "./react/optimization-context";
export { PetrinautOptimizationContext } from "./react/optimization-context";

export type { PetrinautSlots } from "./ui/types/petrinaut-slots";
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

export {
  canonicalizePetrinautIds,
  combineCommandRegistries,
  createCommandRegistry,
  createJsonDocHandle,
  createPetrinaut,
  createPetrinautActions,
  createSimulation,
  createWorkerTransport,
  isSDCPNEqual,
  type BackpressureConfig,
  type Color,
  type Command,
  type CommandRegistry,
  type CommandRegistryView,
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
export type { PetrinautProps } from "./ui/petrinaut";
