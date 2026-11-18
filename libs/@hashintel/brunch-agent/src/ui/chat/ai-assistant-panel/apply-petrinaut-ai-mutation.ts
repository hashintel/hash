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
  toBlockedOutput,
  toPetrinautAiToolOutput,
} from "./tool-summaries";

import type { PetrinautAiMutationExecutor } from "./types";
import type {
  EditResult,
  PluginDocument,
  PluginEdits,
} from "@hashintel/petrinaut/ui/plugin";

type PetrinautAiMutationCall = Extract<
  AiToolCall,
  { toolName: PetrinautAiMutationToolName }
>;

/**
 * Execute one canonical mutation while Petrinaut owns its no-op detection and
 * model-facing output. Hosts may observe around this synchronous boundary,
 * but do not need a full editor instance to use it. An edit the plugin API
 * refuses, such as on a read-only editor, reports `applied: false` with the
 * refusal and never a change.
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
  const callback = edit[aiToolCall.toolName] as (
    input: typeof aiToolCall.input,
  ) => EditResult;
  const result = callback(aiToolCall.input);
  if (!result.applied) {
    return toBlockedOutput(result.reason);
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

const applyMutation = ({
  aiToolCall,
  document,
}: {
  aiToolCall: PetrinautAiMutationCall;
  document: Pick<PluginDocument, "net" | "edit">;
}): AiToolOutput =>
  executePetrinautAiMutation({
    aiToolCall,
    getDefinition: () => document.net.get(),
    edit: document.edit,
  });

export const applyPetrinautAiMutation = ({
  aiToolCall,
  document,
  toolCallId,
  executeMutation,
}: Parameters<typeof applyMutation>[0] & {
  toolCallId?: string;
  executeMutation?: PetrinautAiMutationExecutor;
}): AiToolOutput => {
  if (!executeMutation) return applyMutation({ aiToolCall, document });
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
        return applyMutation({ aiToolCall, document });
      },
    });
  } finally {
    // Even a throwing host cannot retain work beyond this generation's turn.
    active = false;
  }
};
