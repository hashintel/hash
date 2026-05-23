// Public surface for `@hashintel/petrinaut/react` — React bindings.
//
// Hooks, contexts, and bridge providers that synchronize a Core instance with
// React. No visual widgets — `/ui` builds on top of this.

// --- Instance access + low-level adapters ---
export { PetrinautInstanceContext } from "./instance-context";
export { usePetrinautInstance } from "./use-petrinaut-instance";
export { useStore, useStoreSelector } from "./use-store";

// --- Provider unification ---
export { PetrinautProvider } from "./petrinaut-provider";
export type { PetrinautProviderProps } from "./petrinaut-provider";
export { NetManagementContext, type NetManagement } from "./net-management-context";
export { ExperimentsContext, isExperimentActive } from "./experiments/context";
export type {
  CreateExperimentInput,
  ExperimentRecord,
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
  ReadableStore,
} from "@hashintel/petrinaut-core";
