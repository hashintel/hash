import { useModel } from "@flue/runtime";

import systemPrompt from "../SYSTEM.md?raw";
import universalElicitationReference from "../universal-elicitation.md?raw";

/**
 * Mount the capabilities owned by Brunch core and return its system prompt.
 *
 * Core currently owns no model-facing skill or tool. Add one here only when it
 * applies independently of the selected modelling formalism and host.
 */
export function useBrunchAgent(model: string): string {
  useModel(model);
  return systemPrompt.replace(/^\s+|\s+$/gu, "");
}

/** Core-owned progressive elicitation teaching for explicit skill composition. */
export { universalElicitationReference };
