import {
  createPetrinautAiWritableCallbacks,
  isSDCPNEqual,
  type Petrinaut,
  type PetrinautAiMutationToolName,
} from "@hashintel/petrinaut-core";

import {
  type AiToolCall,
  type AiToolOutput,
  summarizePetrinautAiToolCall,
  toPetrinautAiToolOutput,
} from "./tool-summaries";

import type { PetrinautAiMutationExecutor } from "./types";

const applyMutation = ({
  aiToolCall,
  instance,
}: {
  aiToolCall: Extract<AiToolCall, { toolName: PetrinautAiMutationToolName }>;
  instance: Petrinaut;
}): AiToolOutput => {
  const definition = instance.definition.get();
  const toolCallbacks = createPetrinautAiWritableCallbacks(instance);
  const summary = summarizePetrinautAiToolCall(aiToolCall, { definition });
  const callback = toolCallbacks[aiToolCall.toolName] as (
    input: typeof aiToolCall.input,
  ) => void;

  callback(aiToolCall.input);

  // Only the unchanged document is observed here. The mutation may have
  // declined for a reason narrower than "already present" (an arc between the
  // same endpoints with a different weight, for one), so the reason must not
  // claim the requested state exists.
  if (isSDCPNEqual(definition, instance.definition.get())) {
    return {
      applied: false,
      reason: `${summary.title} left the document unchanged.`,
    };
  }

  return toPetrinautAiToolOutput(summary);
};

export const applyPetrinautAiMutation = ({
  aiToolCall,
  instance,
  toolCallId,
  executeMutation,
}: Parameters<typeof applyMutation>[0] & {
  toolCallId?: string;
  executeMutation?: PetrinautAiMutationExecutor;
}): AiToolOutput => {
  if (!executeMutation) return applyMutation({ aiToolCall, instance });
  if (!toolCallId)
    throw new Error("A mutation executor requires a tool call ID.");

  let active = true;
  let executed = false;
  try {
    return executeMutation({
      ...aiToolCall,
      toolCallId,
      execute: () => {
        if (!active) throw new Error("Mutation execution must be synchronous.");
        if (executed) throw new Error("A mutation may execute only once.");
        executed = true;
        return applyMutation({ aiToolCall, instance });
      },
    });
  } finally {
    // Even a throwing host cannot retain work beyond this generation's turn.
    active = false;
  }
};
