import type { AiToolOutput } from "./tool-summaries";
import type {
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
  PetrinautAiCommandToolInput,
  PetrinautAiCommandToolName,
  PetrinautAiMutationToolInput,
  PetrinautAiMutationToolName,
  PetrinautAiToolInput,
  SDCPN,
  setNetTitleToolName,
} from "@hashintel/petrinaut-core";
import type { ChatTransport, UIDataTypes, UIMessage } from "ai";

type PetrinautAiUiTools = {
  [Name in PetrinautAiMutationToolName]: {
    input: PetrinautAiMutationToolInput<Name>;
    output: AiToolOutput;
  };
} & {
  [Name in PetrinautAiCommandToolName]: {
    input: PetrinautAiCommandToolInput<Name>;
    output: AiToolOutput;
  };
} & {
  [getLatestNetDefinitionToolName]: {
    input: PetrinautAiToolInput<typeof getLatestNetDefinitionToolName>;
    output: { title: string; definition: SDCPN };
  };
  [getNetCompilationErrorsToolName]: {
    input: PetrinautAiToolInput<typeof getNetCompilationErrorsToolName>;
    output: string;
  };
  [setNetTitleToolName]: {
    input: PetrinautAiToolInput<typeof setNetTitleToolName>;
    output: AiToolOutput;
  };
};

export type PetrinautAiMessage = UIMessage<
  unknown,
  UIDataTypes,
  PetrinautAiUiTools
>;

export type PetrinautAiTransport = ChatTransport<PetrinautAiMessage>;
