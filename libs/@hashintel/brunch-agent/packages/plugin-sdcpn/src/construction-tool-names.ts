import {
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
} from "@hashintel/petrinaut-core/ai";

import { observedArcMutationNames } from "./root-arc";
import { observedNodeMutationNames } from "./root-node";
import { observedStateMutationNames } from "./root-state";

export const readPetrinautNetToolName = "read_petrinaut_net";
export const readPetrinautDiagnosticsToolName = "read_petrinaut_diagnostics";
export const layoutPetrinautNetToolName = "layout_petrinaut_net";
/** @deprecated Use `layoutPetrinautNetToolName`. */
export const applyAutoLayoutToolName = layoutPetrinautNetToolName;

export const legacyReadPetrinautNetToolName = getLatestNetDefinitionToolName;
export const legacyReadPetrinautDiagnosticsToolName =
  getNetCompilationErrorsToolName;
export const legacyLayoutPetrinautNetToolName = "applyAutoLayout";

export const isReadPetrinautNetToolName = (name: string): boolean =>
  name === readPetrinautNetToolName || name === legacyReadPetrinautNetToolName;

export const isReadPetrinautDiagnosticsToolName = (name: string): boolean =>
  name === readPetrinautDiagnosticsToolName ||
  name === legacyReadPetrinautDiagnosticsToolName;

export const isLayoutPetrinautNetToolName = (name: string): boolean =>
  name === layoutPetrinautNetToolName ||
  name === legacyLayoutPetrinautNetToolName;

/** Mount order for the conversation-bound construction candidate; each member owns its own list. */
export const observedConstructionBrowserToolNames = [
  readPetrinautNetToolName,
  ...observedArcMutationNames,
  ...observedNodeMutationNames,
  readPetrinautDiagnosticsToolName,
  ...observedStateMutationNames,
] as const;
