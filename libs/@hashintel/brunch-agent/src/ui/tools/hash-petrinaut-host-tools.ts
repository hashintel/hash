import {
  hashPetrinautTools,
  type HashPetrinautToolName,
  hashProcessEditorId,
} from "@hashintel/brunch-agent";

import { executePetrinautAiMutation } from "../chat/ai-assistant-panel";

import type { PetrinautAiAutomaticTool } from "../chat/ai-automatic-tool";

type Output = ReturnType<typeof executePetrinautAiMutation>;

/**
 * One output for a call's steps: a single step's own; several steps' applied
 * titles, with what each did; or, when none changed anything, the first
 * step's no-op.
 */
const combinedOutput = (
  toolName: string,
  outputs: readonly Output[],
): Output => {
  const [first] = outputs;
  if (first === undefined)
    return {
      applied: false,
      reason: `${toolName} named nothing to change and left the document unchanged.`,
    };
  if (outputs.length === 1) return first;
  const applied = outputs.flatMap((output) => (output.applied ? [output] : []));
  const [firstApplied] = applied;
  if (firstApplied === undefined) return first;
  return {
    applied: true,
    title: applied.map(({ title }) => title).join("; "),
    items: outputs.map((output) =>
      output.applied ? output.title : output.reason,
    ),
    ...(firstApplied.target === undefined
      ? {}
      : { target: firstApplied.target }),
  };
};

/**
 * One of HASH's Petrinaut tools as the page runs it: its canonical calls, in
 * order, on the editor the call names. A refusal, such as a read-only
 * editor's, stops the call with the refusal as its output; it always comes on
 * the first call. The server refuses any other editor before issuing the
 * call; one arriving here fails as an input the tool doesn't accept would.
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
      const { editorId, calls } = parseCall(input);
      if (editorId !== hashProcessEditorId)
        throw new Error(`The page shows no editor "${editorId}".`);
      const getDefinition = () => {
        const definition = handle.doc();
        if (!definition)
          throw new Error("The bound browser document is unavailable.");
        return definition;
      };
      const outputs: Output[] = [];
      for (const call of calls) {
        // Refused while the editor is read-only: the refusal is the output.
        const output = executePetrinautAiMutation({
          aiToolCall: call,
          getDefinition,
          edit,
        });
        if ("blocked" in output) return output;
        outputs.push(output);
      }
      return combinedOutput(toolName, outputs);
    },
  };
};

/** HASH's Petrinaut tools, for HASH's process page to pass Brunch as host tools. */
export const hashPetrinautHostTools: readonly PetrinautAiAutomaticTool[] = (
  Object.keys(hashPetrinautTools) as HashPetrinautToolName[]
).map(hashPetrinautHostTool);
