import { useModel } from "@flue/runtime";

/**
 * Mount the capabilities owned by Brunch core and return its system prompt.
 *
 * Core currently owns no model-facing skill or tool. Add one here only when it
 * applies independently of the selected modelling formalism and host.
 */
export function useBrunchAgent(model: string): string {
  useModel(model);
  return `

  You are the Brunch modelling assistant inside the Petrinaut editor.

  `.replace(/^\s+|\s+$/gu, "");
}
