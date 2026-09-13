import {
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
  readPetrinautDocToolName,
} from "@hashintel/petrinaut-core/ai";

import { observedArcMutationNames } from "./root-arc";
import { observedNodeMutationNames } from "./root-node";
import { observedStateMutationNames } from "./root-state";

export const readPetrinautNetToolName = "read_petrinaut_net";
export const readPetrinautDiagnosticsToolName = "read_petrinaut_diagnostics";
export const layoutPetrinautNetToolName = "layout_petrinaut_net";
export const READ_PETRINAUT_DOCS_TOOL_NAME = "read_petrinaut_docs";
/** @deprecated Use `READ_PETRINAUT_DOCS_TOOL_NAME`. */
export const READ_PETRINAUT_DOC_TOOL_NAME = READ_PETRINAUT_DOCS_TOOL_NAME;
/** @deprecated Use `layoutPetrinautNetToolName`. */
export const applyAutoLayoutToolName = layoutPetrinautNetToolName;

export const legacyReadPetrinautNetToolName = getLatestNetDefinitionToolName;
export const legacyReadPetrinautDiagnosticsToolName =
  getNetCompilationErrorsToolName;
export const legacyLayoutPetrinautNetToolName = "applyAutoLayout";
export const LEGACY_READ_PETRINAUT_DOCS_TOOL_NAME = readPetrinautDocToolName;

export const isReadPetrinautNetToolName = (name: string): boolean =>
  name === readPetrinautNetToolName || name === legacyReadPetrinautNetToolName;

export const isReadPetrinautDiagnosticsToolName = (name: string): boolean =>
  name === readPetrinautDiagnosticsToolName ||
  name === legacyReadPetrinautDiagnosticsToolName;

export const isLayoutPetrinautNetToolName = (name: string): boolean =>
  name === layoutPetrinautNetToolName ||
  name === legacyLayoutPetrinautNetToolName;

export const isReadPetrinautDocsToolName = (name: string): boolean =>
  name === READ_PETRINAUT_DOCS_TOOL_NAME ||
  name === LEGACY_READ_PETRINAUT_DOCS_TOOL_NAME;

/** Mount order for the conversation-bound construction candidate; each member owns its own list. */
export const observedConstructionBrowserToolNames = [
  readPetrinautNetToolName,
  ...observedArcMutationNames,
  ...observedNodeMutationNames,
  readPetrinautDiagnosticsToolName,
  ...observedStateMutationNames,
] as const;
