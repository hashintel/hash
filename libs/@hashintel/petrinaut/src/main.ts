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
} from "./core/types/sdcpn";
export type { ViewportAction } from "./ui/types/viewport-action";

// SDCPN deep-equality helper (also exported from `/ui`).
export { isSDCPNEqual } from "./core/lib/deep-equal";

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
export { createPetrinautActions } from "./core/actions";
export type { MutationHelperFunctions } from "./core/actions";
export {
  createPetrinautAiPrompt,
  createPetrinautAiToolCallbacks,
  petrinautAiToolInputSchemas,
  petrinautAiTools,
} from "./core/ai";
export type {
  PetrinautAiTool,
  PetrinautAiToolCallbacks,
  PetrinautAiToolInput,
  PetrinautAiToolName,
  PetrinautAiTools,
} from "./core/ai";
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
export { Petrinaut } from "./ui/petrinaut";
export type { PetrinautProps } from "./ui/petrinaut";

// LSP exports are deliberately NOT in main.ts — see 08-migration.md "Phase 2c"
// known issue. The dts bundler duplicates `vscode-languageserver-types` symbols
// when reached through multiple paths. Resolves naturally in Phase 5 once
// `/core` becomes its own bundle entry.
