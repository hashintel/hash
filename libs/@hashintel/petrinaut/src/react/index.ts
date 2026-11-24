/**
 * Public surface for `@hashintel/petrinaut/react` — React bindings.
 *
 * The contexts, hooks and providers that publish a Core instance to React,
 * one section per block of the layer. The layer shows notices and renders no
 * other UI: `/ui` builds the editor on top of it.
 *
 * This file is the published entry. A file of the package imports the file
 * that defines a name, never this one.
 *
 * @layerRoot react
 * @role Contexts, hooks and providers that mirror core state into React
 */

// --- The provider stack (react) ---
export { PetrinautProvider } from "./petrinaut-provider";
export type { PetrinautProviderProps } from "./petrinaut-provider";
export {
  PetrinautCanvasProvider,
  PetrinautDocumentProvider,
} from "./petrinaut-provider-layers";
export type {
  PetrinautCanvasProviderProps,
  PetrinautDocumentProviderProps,
} from "./petrinaut-provider-layers";

// --- The instance and its document (react.document) ---
export { PetrinautInstanceContext } from "./document/instance-context";
export { usePetrinautInstance } from "./document/use-petrinaut-instance";
export {
  useDocumentId,
  usePetrinautDefinitionSelector,
} from "./document/use-document";

// --- Editing, and whether it is allowed (react.editing) ---
export { useIsReadOnly } from "./editing/use-is-read-only";
export {
  formatReadOnlyReason,
  useReadOnlyReason,
  type ReadOnlyReason,
} from "./editing/use-read-only-reason";
export {
  usePetrinautMutations,
  type GuardedPetrinautMutations,
} from "./editing/use-petrinaut-mutations";
export { usePetrinautCommands } from "./editing/use-petrinaut-commands";
export type {
  PetrinautCommands,
  PetrinautMutations,
} from "@hashintel/petrinaut-core";

// --- What the host supplies (react.host) ---
export {
  NetManagementContext,
  type NetManagement,
} from "./host/net-management-context";
export { ErrorTrackerContext } from "./host/error-tracker-context";
export type {
  ErrorTracker,
  ErrorTrackerCaptureContext,
} from "./host/error-tracker-context";
export { ActualModeContext } from "./host/actual-mode-context";
export type { ActualModeContextValue } from "./host/actual-mode-context";

// --- The location (react.navigation) ---
export {
  defaultPetrinautNavigationHistoryPolicy,
  defaultPetrinautNavigationState,
  openPetrinautComponent,
  openPetrinautSimulationResource,
  petrinautNavigationStatesMatch,
  usePetrinautNavigate,
  usePetrinautNavigation,
  usePetrinautNavigationState,
} from "./navigation/navigation";
export { PetrinautNavigationProvider } from "./navigation/navigation-provider";
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
  PetrinautSettingsSection,
} from "./navigation/navigation";
export type { PetrinautNavigationProviderProps } from "./navigation/navigation-provider";
// The vocabularies two navigation fields are drawn from. A host encoding the
// location into a router needs to spell them, and to fail its own build when
// either gains a member.
export type {
  EditorGlobalMode,
  EditViewMode,
  SimulateViewMode,
} from "./navigation/navigation";

// --- User settings (react.state) ---
// A host mounts the provider above `Petrinaut` to read and change the
// persisted settings from its own components; the editor reuses that instance.
export { UserSettingsContext } from "./state/user-settings-context";
export type {
  UserSettings,
  UserSettingsContextValue,
} from "./state/user-settings-context";
export { UserSettingsProvider } from "./state/user-settings-provider";

// --- Palette commands (react.commands) ---
export {
  useCommand,
  useCommandRegistry,
  useCommands,
} from "./commands/command-registry";
export { CommandRegistryProvider } from "./commands/command-registry-provider";
export { formatShortcutKeys } from "./commands/format-shortcut";

// --- Notices (react.notifications) ---
export { NotificationsContext } from "./notifications/context";
export type {
  AddNotificationInput,
  NotificationsContextValue,
  NotificationTone,
} from "./notifications/context";
export { NotificationsProvider } from "./notifications/provider";

// --- Simulators and the Quick Simulation (react.simulators, react.simulation) ---
// A `SimulationProvider` starts its runs on the simulators the nearest
// `SimulatorsProvider` registers, so a host that mounts one mounts both.
export { SimulatorsContext } from "./simulators/context";
export type {
  SimulationMode,
  SimulatorSelection,
  SimulatorsContextValue,
} from "./simulators/context";
export { SimulatorsProvider } from "./simulators/provider";
export type { SimulatorsProviderProps } from "./simulators/provider";
export { SimulationProvider } from "./simulation/provider";
export type {
  SimulationCompiler,
  SimulationProviderProps,
} from "./simulation/provider";

// --- Experiments, optimizations and the experiment host
// (react.experiments, react.optimizations, react.experiment-host) ---
export {
  ExperimentsActionsContext,
  ExperimentsContext,
  isExperimentActive,
} from "./experiments/context";
export type {
  CreateExperimentInput,
  ExperimentRecord,
  ExperimentsActionsValue,
  ExperimentStatus,
  ExperimentsContextValue,
} from "./experiments/context";
export {
  isOptimizationActive,
  OptimizationsContext,
} from "./optimizations/context";
export type {
  OptimizationBest,
  OptimizationRecord,
  OptimizationStatus,
  OptimizationsContextValue,
} from "./optimizations/context";
export { PetrinautOptimizationContext } from "./optimizations/connected-optimizer-context";
export type {
  PetrinautConnectedOptimization,
  PetrinautConnectedOptimizationCapability,
  PetrinautConnectedRunOptions,
  PetrinautOptimizationChannel,
} from "./optimizations/connected-optimizer-context";
export { ExperimentHostContext } from "./experiment-host/context";
export { prepareExperiment } from "./experiment-host/prepare-experiment";

// --- Reading a Core store (react.shared) ---
export { useStore, useStoreSelector } from "./shared/use-store";

// --- Core types, for convenience ---
export type {
  CreatePetrinautConfig,
  EventStream,
  Petrinaut,
  PetrinautDocHandle,
  PetrinautExtension,
  PetrinautExtensionSettings,
  PetrinautHandleCapabilities,
  ReadableStore,
} from "@hashintel/petrinaut-core";
