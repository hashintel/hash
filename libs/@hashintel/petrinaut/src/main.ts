export type { ErrorTracker } from "./react/error-tracker-context";
export { ErrorTrackerContext } from "./react/error-tracker-context";

export type { ViewportAction } from "./ui/types/viewport-action";

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
  type SimulationPlaceTokenValues,
  type SimulationState,
  type SimulationTransport,
  type Transition,
  type WorkerFactory,
} from "@hashintel/petrinaut-core";
export { Petrinaut } from "./ui/petrinaut";
export type { PetrinautProps } from "./ui/petrinaut";

// LSP exports are deliberately NOT in main.ts — see 08-migration.md "Phase 2c"
// known issue. The dts bundler duplicates `vscode-languageserver-types` symbols
// when reached through multiple paths. Resolves naturally in Phase 5 once
// `/core` becomes its own bundle entry.
