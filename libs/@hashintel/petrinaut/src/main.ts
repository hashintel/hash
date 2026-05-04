export type { ErrorTracker } from "./error-tracker/error-tracker.context";
export { ErrorTrackerContext } from "./error-tracker/error-tracker.context";
export * from "./ui/petrinaut";

// Phase 0 spike: handle-driven entry path. See rfc/0001-core-react-ui-split.
export { createJsonDocHandle } from "./core/handle";
export type {
  CreateJsonDocHandleOptions,
  DocChangeEvent,
  DocHandleState,
  DocumentId,
  HistoryEntry,
  PetrinautDocHandle,
  PetrinautHistory,
  PetrinautPatch,
  ReadableStore,
} from "./core/handle";
export { createPetrinaut } from "./core/instance";
export type {
  CreatePetrinautConfig,
  EventStream,
  Petrinaut as PetrinautInstance,
} from "./core/instance";
export {
  createSimulation,
  createWorkerTransport,
} from "./core/simulation";
export type {
  BackpressureConfig,
  CreateSimulationConfig,
  Simulation,
  SimulationCompleteEvent,
  SimulationConfig,
  SimulationErrorEvent,
  SimulationEvent,
  SimulationFrameSummary,
  SimulationState,
  SimulationTransport,
  WorkerFactory,
} from "./core/simulation";
export { PetrinautNext } from "./ui/petrinaut-next";
export type { PetrinautNextProps } from "./ui/petrinaut-next";

// LSP exports are deliberately NOT in main.ts — see 08-migration.md "Phase 2c"
// known issue. The dts bundler duplicates `vscode-languageserver-types` symbols
// when reached through multiple paths. Resolves naturally in Phase 5 once
// `/core` becomes its own bundle entry.
