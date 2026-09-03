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

export const applyPetrinautAiMutation = ({
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

  if (isSDCPNEqual(definition, instance.definition.get())) {
    return {
      applied: false,
      reason: `${summary.title} was a no-op because the document already had that state.`,
    };
  }

  return toPetrinautAiToolOutput(summary);
};
