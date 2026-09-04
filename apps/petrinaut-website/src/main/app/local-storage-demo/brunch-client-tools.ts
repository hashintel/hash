import { readPetrinautDocToolName } from "@hashintel/petrinaut-core";

import type { PetrinautAiToolName } from "@hashintel/petrinaut-core/ai";

export const scratchProjectConstructionMode =
  "scratch-project-construction" as const;

export const scratchProjectConstructionInitialData = {
  mode: scratchProjectConstructionMode,
} as const;

export const scratchProjectConstructionToolNames = [
  "getLatestNetDefinition",
  "addType",
  "addParameter",
  "addPlace",
  "addTransition",
  "addArc",
] as const satisfies readonly PetrinautAiToolName[];

/**
 * The one catalog of tools the browser answers on Brunch's behalf. The panel
 * transport admits their results, the history projection leaves them runnable,
 * and every interactive widget the demo registers must name one of them so a
 * composer answer reaches Flue as a `client-tool-result` rather than an error.
 * Kept free of React imports so the transport can load outside the DOM.
 */
export const brunchClientToolNames: ReadonlySet<string> = new Set([
  readPetrinautDocToolName,
  ...scratchProjectConstructionToolNames,
]);
