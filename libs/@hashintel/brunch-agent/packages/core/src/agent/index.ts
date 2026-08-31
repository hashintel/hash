import { useModel } from "@flue/runtime";

import { BRUNCH_CORE_SYSTEM_PROMPT } from "./system-prompt";

export { BRUNCH_CORE_SYSTEM_PROMPT };

/**
 * Mount the capabilities owned by Brunch core and return its system prompt.
 *
 * Core currently owns no model-facing skill or tool. Add one here only when it
 * applies independently of the selected modelling formalism and host.
 */
export function useBrunchAgent(model: string): string {
  useModel(model);
  return BRUNCH_CORE_SYSTEM_PROMPT;
}
