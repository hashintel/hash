import {
  createPetrinautAiWritableCallbacks,
  isSDCPNEqual,
  mutationActionInputSchemas,
  type Petrinaut,
  type PetrinautAiMutationToolName,
  type PetrinautMutations,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import {
  type AiToolCall,
  type AiToolOutput,
  summarizePetrinautAiToolCall,
  toPetrinautAiToolOutput,
} from "./tool-summaries";

import type { PetrinautAiMutationExecutor } from "./types";

type PetrinautAiMutationCall = Extract<
  AiToolCall,
  { toolName: PetrinautAiMutationToolName }
>;

/**
 * Execute one canonical mutation while Petrinaut owns its no-op detection and
 * model-facing output. Hosts may observe around this synchronous boundary,
 * but do not need a full editor instance to use it.
 */
export const executePetrinautAiMutation = ({
  aiToolCall,
  getDefinition,
  mutations,
}: {
  aiToolCall: PetrinautAiMutationCall;
  getDefinition: () => SDCPN;
  mutations: PetrinautMutations;
}): AiToolOutput => {
  const definition = getDefinition();

  if (!Object.hasOwn(mutationActionInputSchemas, aiToolCall.toolName)) {
    throw new Error(`Unsupported Petrinaut mutation: ${aiToolCall.toolName}`);
  }

  // Parsed first, so the summary's targets carry the converted ids the
  // mutation stores, not the ids the assistant wrote.
  const parsedCall = {
    ...aiToolCall,
    input: mutationActionInputSchemas[aiToolCall.toolName].parse(
      aiToolCall.input,
    ),
  } as PetrinautAiMutationCall;
  const summary = summarizePetrinautAiToolCall(parsedCall, { definition });
  const callback = mutations[parsedCall.toolName] as (
    input: typeof parsedCall.input,
  ) => void;
  callback(parsedCall.input);

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

const applyMutation = ({
  aiToolCall,
  instance,
}: {
  aiToolCall: PetrinautAiMutationCall;
  instance: Petrinaut;
}): AiToolOutput =>
  executePetrinautAiMutation({
    aiToolCall,
    getDefinition: () => instance.definition.get(),
    mutations: createPetrinautAiWritableCallbacks(instance),
  });

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
