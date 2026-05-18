export type { ErrorTracker } from "./react/error-tracker-context";
export { ErrorTrackerContext } from "./react/error-tracker-context";

// SDCPN domain types (previously re-exported via the legacy `<Petrinaut>`
// barrel). Kept on the back-compat surface so downstream consumers don't
// need to switch import paths in the same change that retired the legacy
// editor entry.
export type {
  Color,
  DifferentialEquation,
  MinimalNetMetadata,
  MutateSDCPN,
  Parameter,
  Place,
  SDCPN,
  Transition,
} from "@hashintel/petrinaut-core/types/sdcpn";
export type { ViewportAction } from "./ui/types/viewport-action";

// SDCPN deep-equality helper (also exported from `/ui`).
export { isSDCPNEqual } from "@hashintel/petrinaut-core/lib/deep-equal";

export { createJsonDocHandle } from "@hashintel/petrinaut-core/handle";
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
} from "@hashintel/petrinaut-core/handle";
export { createPetrinaut } from "@hashintel/petrinaut-core/instance";
export type {
  CreatePetrinautConfig,
  EventStream,
  Petrinaut as PetrinautInstance,
} from "@hashintel/petrinaut-core/instance";
export { createPetrinautActions } from "@hashintel/petrinaut-core/actions";
export type { MutationHelperFunctions } from "@hashintel/petrinaut-core/actions";
export {
  createSimulation,
  createWorkerTransport,
} from "@hashintel/petrinaut-core/simulation";
export type {
  BackpressureConfig,
  CreateSimulationConfig,
  InitialMarking,
  Simulation,
  SimulationCompleteEvent,
  SimulationConfig,
  SimulationErrorEvent,
  SimulationEvent,
  SimulationFrameReader,
  SimulationFrameState,
  SimulationFrameSummary,
  SimulationPlaceTokenValues,
  SimulationState,
  SimulationTransport,
  WorkerFactory,
} from "@hashintel/petrinaut-core/simulation";
export { Petrinaut } from "./ui/petrinaut";
export type { PetrinautProps } from "./ui/petrinaut";

// LSP exports are deliberately NOT in main.ts — see 08-migration.md "Phase 2c"
// known issue. The dts bundler duplicates `vscode-languageserver-types` symbols
// when reached through multiple paths. Resolves naturally in Phase 5 once
// `/core` becomes its own bundle entry.
