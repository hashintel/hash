import {
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
  type PetrinautAiToolName,
} from "@hashintel/petrinaut-core/ai";

import { observedArcMutationNames } from "./root-arc";
import { observedNodeMutationNames } from "./root-node";
import { observedStateMutationNames } from "./root-state";

/** Canonical Petrinaut ELK command name; Brunch mounts it, it does not rename it. */
export const applyAutoLayoutToolName =
  "applyAutoLayout" satisfies PetrinautAiToolName;

/** Mount order for the conversation-bound construction candidate; each member owns its own list. */
export const observedConstructionBrowserToolNames = [
  getLatestNetDefinitionToolName,
  ...observedArcMutationNames,
  ...observedNodeMutationNames,
  getNetCompilationErrorsToolName,
  ...observedStateMutationNames,
] as const satisfies readonly PetrinautAiToolName[];
