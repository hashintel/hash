import { brunchTools, parseHashSaveInput } from "@hashintel/brunch-agent";

import {
  definePetrinautAiAutomaticTool,
  type PetrinautAiAutomaticTool,
} from "../chat/ai-automatic-tool";

import type { BrunchHostSave } from "./brunch-mutation-approval";

/** Brunch's HASH save, run in the page through the editor's own Save. */
export const createHashPetrinautSaveTool = (
  hostSave: BrunchHostSave,
): PetrinautAiAutomaticTool =>
  definePetrinautAiAutomaticTool({
    toolName: brunchTools.appSaveNet,
    inputParser: { parse: parseHashSaveInput },
    outputParser: { parse: (value) => value },
    execute: ({ input, signal }) => hostSave.save(input.documentId, signal),
  });
