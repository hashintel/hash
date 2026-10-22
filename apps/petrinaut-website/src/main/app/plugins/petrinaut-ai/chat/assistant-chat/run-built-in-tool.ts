import {
  createExperimentToolName,
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
  mutationActionInputSchemas,
  petrinautExperimentRequestSchema,
  readPetrinautDocToolInputSchema,
  readPetrinautDocToolName,
  setNetTitleToolInputSchema,
  setNetTitleToolName,
  type PetrinautAiMutationToolName,
  type PetrinautExperimentRequest,
  type PetrinautExperimentResult,
} from "@hashintel/petrinaut-core";
import { petrinautDocsContent } from "@hashintel/petrinaut/ui";

import { executePetrinautAiMutation } from "./execute-petrinaut-ai-mutation";
import { readCurrentDiagnostics } from "./read-current-diagnostics";
import {
  type AiToolCall,
  type AiToolOutput,
  summarizeApplyAutoLayout,
  toPetrinautAiToolOutput,
  toRefusalOutput,
} from "./tool-summaries";

import type { PetrinautAiUiTools } from "../ai-message";
import type { AssistantChatApi } from "./chat-api";

/** A tool call the browser answers. */
export type BuiltInToolCall = {
  toolName: keyof PetrinautAiUiTools;
  toolCallId: string;
  input: unknown;
};

/** What the built-in tools reach: the document, and the chat's experiment runs. */
type BuiltInToolContext = {
  document: AssistantChatApi["document"];
  runExperiment: (
    toolCallId: string,
    request: PetrinautExperimentRequest,
  ) => Promise<PetrinautExperimentResult>;
};

const isMutationToolName = (
  toolName: string,
): toolName is PetrinautAiMutationToolName =>
  toolName in mutationActionInputSchemas;

/** Lays the net out, as the `applyAutoLayout` tool and its prompt do. */
export const applyAutoLayout = async (
  edit: AssistantChatApi["document"]["edit"],
): Promise<AiToolOutput> => {
  const layout = await edit.applyAutoLayout();

  return layout.applied
    ? toPetrinautAiToolOutput(summarizeApplyAutoLayout(layout.value))
    : toRefusalOutput(layout.reason);
};

const renameNet = (
  document: AssistantChatApi["document"],
  title: string,
): AiToolOutput => {
  const previousTitle = document.title.get();
  const renamed = document.setTitle(title);

  return renamed.applied
    ? toPetrinautAiToolOutput({
        title: `Renamed net to "${title}"`,
        detail:
          previousTitle && previousTitle !== title
            ? `Previous title: ${previousTitle}`
            : undefined,
      })
    : toRefusalOutput(renamed.reason);
};

/** Runs one of Petrinaut AI's built-in tools and returns its output for the model. */
export const runBuiltInTool = async (
  { toolName, toolCallId, input }: BuiltInToolCall,
  { document, runExperiment }: BuiltInToolContext,
): Promise<unknown> => {
  if (isMutationToolName(toolName)) {
    return executePetrinautAiMutation({
      aiToolCall: {
        toolName,
        input: mutationActionInputSchemas[toolName].parse(input),
      } as Extract<AiToolCall, { toolName: PetrinautAiMutationToolName }>,
      getDefinition: () => document.net.get(),
      edit: document.edit,
    });
  }

  switch (toolName) {
    case createExperimentToolName:
      return runExperiment(
        toolCallId,
        petrinautExperimentRequestSchema.parse(input),
      );
    case getLatestNetDefinitionToolName:
      return {
        title: document.title.get(),
        definition: document.net.get(),
        extensions: document.extensions,
      };
    case getNetCompilationErrorsToolName:
      return readCurrentDiagnostics(document);
    case readPetrinautDocToolName:
      return petrinautDocsContent[
        readPetrinautDocToolInputSchema.parse(input).doc
      ];
    case setNetTitleToolName:
      return renameNet(document, setNetTitleToolInputSchema.parse(input).title);
    case "applyAutoLayout":
      return applyAutoLayout(document.edit);
    default: {
      const unknownToolName: never = toolName;
      throw new Error(`Unknown AI tool: ${String(unknownToolName)}`);
    }
  }
};
