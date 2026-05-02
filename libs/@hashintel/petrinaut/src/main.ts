export type { ErrorTracker } from "./error-tracker/error-tracker.context";
export { ErrorTrackerContext } from "./error-tracker/error-tracker.context";
export * from "./petrinaut";

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
  StartSimulationConfig,
} from "./core/instance";
export {
  createWorkerTransport,
  startSimulation,
} from "./core/simulation";
export type {
  BackpressureConfig,
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
