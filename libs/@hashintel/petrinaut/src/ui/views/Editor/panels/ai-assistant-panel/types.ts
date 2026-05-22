import type {
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
  PetrinautAiCommandToolInput,
  PetrinautAiCommandToolName,
  PetrinautAiMutationToolInput,
  PetrinautAiMutationToolName,
  PetrinautAiToolInput,
  SDCPN,
} from "@hashintel/petrinaut-core";
import type { ChatTransport, UIDataTypes, UIMessage } from "ai";

import type { AiToolOutput } from "./tool-summaries";

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
    output: SDCPN;
  };
  [getNetCompilationErrorsToolName]: {
    input: PetrinautAiToolInput<typeof getNetCompilationErrorsToolName>;
    output: string;
  };
};

export type PetrinautAiMessage = UIMessage<
  unknown,
  UIDataTypes,
  PetrinautAiUiTools
>;

export type PetrinautAiTransport = ChatTransport<PetrinautAiMessage>;
