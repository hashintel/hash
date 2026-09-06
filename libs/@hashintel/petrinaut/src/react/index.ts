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
  CommandRegistryProvider,
  useCommand,
  useCommandRegistry,
  useCommands,
} from "./commands/command-registry";
export { formatShortcutKeys } from "./commands/format-shortcut";

// --- Instance access + low-level adapters ---
export { PetrinautInstanceContext } from "./instance-context";
export { usePetrinautInstance } from "./use-petrinaut-instance";
export { useStore, useStoreSelector } from "./use-store";
export { ActualModeContext } from "./actual-mode-context";
export type { ActualModeContextValue } from "./actual-mode-context";

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
  openPetrinautSimulationResource,
  openPetrinautSubnet,
  PetrinautNavigationProvider,
  petrinautNavigationStatesMatch,
  usePetrinautNavigation,
} from "./navigation";
export type {
  PetrinautNavigationAction,
  PetrinautNavigationController,
  PetrinautNavigationHistory,
  PetrinautNavigationHistoryPolicy,
  PetrinautNavigationIntent,
  PetrinautNavigationOverlay,
  PetrinautNavigationProviderProps,
  PetrinautNavigationState,
  PetrinautNavigationUpdate,
  PetrinautNavigationUpdater,
  PetrinautSimulateResource,
} from "./navigation";
// The vocabularies two navigation fields are drawn from. A host encoding the
// location into a router needs to spell them, and to fail its own build when
// either gains a member.
export type {
  EditorGlobalMode,
  SimulateViewMode,
} from "./state/editor-context";
export {
  NetManagementContext,
  type NetManagement,
} from "./net-management-context";
export { PetrinautOptimizationContext } from "./optimization-context";
export type { PetrinautOptimization } from "./optimization-context";
export {
  isOptimizationActive,
  OptimizationsContext,
} from "./optimizations/context";
export type {
  OptimizationBest,
  OptimizationConnectionState,
  OptimizationRecord,
  OptimizationStatus,
  OptimizationsContextValue,
} from "./optimizations/context";
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

// --- Error tracker DI ---
export { ErrorTrackerContext } from "./error-tracker-context";
export type { ErrorTracker } from "./error-tracker-context";

// --- Public hook surface ---
export * from "./hooks";

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
