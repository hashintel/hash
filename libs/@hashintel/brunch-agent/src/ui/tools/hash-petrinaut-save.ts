import {
  brunchTools,
  type SaveHashNetForAgent,
  zHashNetSaveInput,
} from "@hashintel/brunch-agent";

import {
  definePetrinautAiAutomaticTool,
  type PetrinautAiAutomaticTool,
} from "../chat/ai-automatic-tool";

/** Brunch's HASH save, run in the page through the editor's own Save. */
export const createHashPetrinautSaveTool = (
  save: SaveHashNetForAgent,
): PetrinautAiAutomaticTool =>
  definePetrinautAiAutomaticTool({
    toolName: brunchTools.saveHashNet,
    inputParser: zHashNetSaveInput,
    outputParser: { parse: (value) => value },
    execute: ({ input, signal }) => save(input.documentId, signal),
  });
