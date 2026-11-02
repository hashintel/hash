/**
 * The HASH agent's Petrinaut tools: Brunch's own names over Petrinaut's
 * canonical operations, each addressed to an editor by `editor_id`. The HASH
 * agent mounts them in place of the operations they map, and HASH's process
 * page runs them; the website's agent keeps Petrinaut's names.
 */

import { z } from "zod";

import {
  mutationActionInputSchemas,
  petrinautAiTools,
  type PetrinautAiMutationToolInput,
  type PetrinautAiMutationToolName,
} from "@hashintel/petrinaut-core/ai";

/**
 * The one editor HASH's process page shows. While a page shows one editor,
 * every Petrinaut tool names it; a call naming any other is not started.
 */
export const hashProcessEditorId = "process-editor";

const editorIdSchema = z.string().meta({
  description: "The editor to act on, as your instructions name it.",
});

/** One call of a canonical operation, as Petrinaut's mutation execution takes it. */
type OperationCall<Operation extends PetrinautAiMutationToolName> = {
  readonly toolName: Operation;
  readonly input: PetrinautAiMutationToolInput<Operation>;
};

const mapped = <Operation extends PetrinautAiMutationToolName>(
  operation: Operation,
  description: string = petrinautAiTools[operation].description,
) => {
  // `extend` on a schema indexed by a type parameter types its input as any
  // operation's; this one is the operation's own, plus the editor.
  const inputSchema = mutationActionInputSchemas[operation].extend({
    editor_id: editorIdSchema,
  }) as unknown as z.ZodType<
    PetrinautAiMutationToolInput<Operation> & { editor_id: string }
  >;
  return {
    /** The canonical operation the tool runs. */
    operation,
    description,
    inputSchema,
    /** The editor a call names, and the canonical call it makes there. */
    parseCall: (
      input: unknown,
    ): { editorId: string; call: OperationCall<Operation> } => {
      const { editor_id: editorId, ...operationInput } =
        inputSchema.parse(input);
      return {
        editorId,
        call: {
          toolName: operation,
          input: operationInput as PetrinautAiMutationToolInput<Operation>,
        },
      };
    },
  };
};

/** HASH's Petrinaut tools, by model-facing name. */
export const hashPetrinautTools = {
  petrinaut_create_place: mapped("addPlace"),
} as const;

export type HashPetrinautToolName = keyof typeof hashPetrinautTools;
