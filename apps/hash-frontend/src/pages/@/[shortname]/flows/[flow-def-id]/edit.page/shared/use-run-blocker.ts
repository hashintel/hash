import { useEnabledFeatureFlags } from "../../../../../../shared/use-enabled-feature-flags";
import { getRunBlocker } from "./run-form";

import type { FlowEditorState } from "@local/hash-isomorphic-utils/flows/flow-editor";

/** Why the user can't run the flow from the editor, or schedule it, or `null` if they can. */
export const useRunBlocker = (editorState: FlowEditorState) => {
  const { ai } = useEnabledFeatureFlags();

  return getRunBlocker(editorState, { canUseAi: ai });
};
