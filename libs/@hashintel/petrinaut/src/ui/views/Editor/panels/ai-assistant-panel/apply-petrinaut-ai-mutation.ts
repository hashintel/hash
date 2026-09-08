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
