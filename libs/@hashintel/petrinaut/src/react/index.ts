/**
 * Public surface for `@hashintel/petrinaut/react` — React bindings.
 *
 * Hooks, contexts, and bridge providers that synchronize a Core instance with
 * React. No visual widgets — `/ui` builds on top of this.
 *
 * @layerRoot react
 * @role Contexts, hooks and providers that mirror core state into React
 */

// --- Palette commands ---
export {
  useCommand,
  useCommandRegistry,
  useCommands,
} from "./commands/command-registry";
export { CommandRegistryProvider } from "./commands/command-registry-provider";
export { formatShortcutKeys } from "./commands/format-shortcut";

// --- Instance access + low-level adapters ---
export { PetrinautInstanceContext } from "./document/instance-context";
export { usePetrinautInstance } from "./document/use-petrinaut-instance";
export { useStore, useStoreSelector } from "./shared/use-store";
export { ActualModeContext } from "./host/actual-mode-context";
export type { ActualModeContextValue } from "./host/actual-mode-context";

// --- Provider unification ---
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
export {
  NetManagementContext,
  type NetManagement,
} from "./host/net-management-context";
export { PetrinautOptimizationContext } from "./optimizations/connected-optimizer-context";
export type {
  PetrinautConnectedOptimization,
  PetrinautConnectedOptimizationCapability,
  PetrinautConnectedRunOptions,
  PetrinautOptimizationChannel,
} from "./optimizations/connected-optimizer-context";
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
export {
  ExperimentsActionsContext,
  ExperimentsContext,
  isExperimentActive,
} from "./experiments/context";
export { ExperimentHostContext } from "./experiment-host/context";
export { prepareExperiment } from "./experiment-host/prepare-experiment";
export type {
  CreateExperimentInput,
  ExperimentRecord,
  ExperimentsActionsValue,
  ExperimentStatus,
  ExperimentsContextValue,
} from "./experiments/context";
export { NotificationsContext } from "./notifications/context";
export type {
  AddNotificationInput,
  NotificationsContextValue,
  NotificationTone,
} from "./notifications/context";
export { NotificationsProvider } from "./notifications/provider";
export { SimulationProvider } from "./simulation/provider";
export type {
  SimulationCompiler,
  SimulationProviderProps,
} from "./simulation/provider";
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

// --- User settings ---
// A host mounts the provider above `Petrinaut` to read and change the
// persisted settings from its own components; the editor reuses that instance.
export { UserSettingsContext } from "./state/user-settings-context";
export type {
  UserSettings,
  UserSettingsContextValue,
} from "./state/user-settings-context";
export { UserSettingsProvider } from "./state/user-settings-provider";

// --- Error tracker DI ---
export { ErrorTrackerContext } from "./host/error-tracker-context";
export type {
  ErrorTracker,
  ErrorTrackerCaptureContext,
} from "./host/error-tracker-context";

// --- Editing, and whether it is allowed ---
export {
  useDocumentId,
  usePetrinautDefinitionSelector,
} from "./document/use-document";
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

// --- Re-export Core types for convenience ---
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
