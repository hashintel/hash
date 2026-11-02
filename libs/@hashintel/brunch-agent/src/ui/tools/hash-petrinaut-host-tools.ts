import {
  hashPetrinautTools,
  type HashPetrinautToolName,
  hashProcessEditorId,
} from "@hashintel/brunch-agent";

import { executePetrinautAiMutation } from "../chat/ai-assistant-panel";

import type { PetrinautAiAutomaticTool } from "../chat/ai-automatic-tool";

/**
 * One of HASH's Petrinaut tools as the page runs it: its canonical operation,
 * on the editor the call names, with the call's other fields as input. The
 * server refuses any other editor before issuing the call; one arriving here
 * fails as an input the tool doesn't accept would.
 */
const hashPetrinautHostTool = (
  toolName: HashPetrinautToolName,
): PetrinautAiAutomaticTool => {
  const { inputSchema, parseCall } = hashPetrinautTools[toolName];
  return {
    toolName,
    inputParser: inputSchema,
    outputParser: { parse: (value) => value },
    execute: ({ input, handle, edit }) => {
      const { editorId, call } = parseCall(input);
      if (editorId !== hashProcessEditorId)
        throw new Error(`The page shows no editor "${editorId}".`);
      return executePetrinautAiMutation({
        aiToolCall: call,
        getDefinition: () => {
          const definition = handle.doc();
          if (!definition)
            throw new Error("The bound browser document is unavailable.");
          return definition;
        },
        // Refused while the editor is read-only: the refusal is the output.
        edit,
      });
    },
  };
};

/** HASH's Petrinaut tools, for HASH's process page to pass Brunch as host tools. */
export const hashPetrinautHostTools: readonly PetrinautAiAutomaticTool[] = (
  Object.keys(hashPetrinautTools) as HashPetrinautToolName[]
).map(hashPetrinautHostTool);
