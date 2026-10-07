import {
  isSDCPNEqual,
  mutationActionInputSchemas,
  type PetrinautAiMutationToolName,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import {
  type AiToolCall,
  type AiToolOutput,
  summarizePetrinautAiToolCall,
  toPetrinautAiToolOutput,
  toRefusalOutput,
} from "./assistant-chat/tool-summaries";

import type { EditResult, PluginEdits } from "@hashintel/petrinaut/ui";

type PetrinautAiMutationCall = Extract<
  AiToolCall,
  { toolName: PetrinautAiMutationToolName }
>;

/**
 * Runs one canonical mutation through the plugin's edits and reports it to
 * the model: the refusal when the editor refused it, a note when it left the
 * document unchanged, its summary otherwise.
 */
export const executePetrinautAiMutation = ({
  aiToolCall,
  getDefinition,
  edit,
}: {
  aiToolCall: PetrinautAiMutationCall;
  getDefinition: () => SDCPN;
  edit: PluginEdits;
}): AiToolOutput => {
  const definition = getDefinition();

  if (!Object.hasOwn(mutationActionInputSchemas, aiToolCall.toolName)) {
    throw new Error(`Unsupported Petrinaut mutation: ${aiToolCall.toolName}`);
  }

  const summary = summarizePetrinautAiToolCall(aiToolCall, { definition });
  const apply = edit[aiToolCall.toolName] as (
    input: typeof aiToolCall.input,
  ) => EditResult;
  const result = apply(aiToolCall.input);
  if (!result.applied) {
    return toRefusalOutput(result.reason);
  }

  // Only the unchanged document is observed here. The mutation may have
  // declined for a reason narrower than "already present" (an arc between the
  // same endpoints with a different weight, for one), so the reason must not
  // claim the requested state exists.
  if (isSDCPNEqual(definition, getDefinition())) {
    return {
      applied: false,
      reason: `${summary.title} left the document unchanged.`,
    };
  }

  return toPetrinautAiToolOutput(summary);
};
