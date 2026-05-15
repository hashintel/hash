import type { ChatTransport, UIDataTypes, UIMessage } from "ai";

import type {
  getLatestNetDefinitionToolName,
  PetrinautAiMutationToolInput,
  PetrinautAiMutationToolName,
  PetrinautAiToolInput,
  PetrinautAiToolName,
} from "../../../../../core/ai";
import type { SDCPN } from "../../../../../core/types/sdcpn";
import type { AiToolOutput } from "./tool-summaries";

type PetrinautAiUiTools = {
  [Name in PetrinautAiMutationToolName]: {
    input: PetrinautAiMutationToolInput<Name>;
    output: AiToolOutput;
  };
} & {
  [getLatestNetDefinitionToolName]: {
    input: PetrinautAiToolInput<typeof getLatestNetDefinitionToolName>;
    output: SDCPN;
  };
};

export type PetrinautAiMessage = UIMessage<
  unknown,
  UIDataTypes,
  PetrinautAiUiTools
>;

export type PetrinautAiTransport = ChatTransport<PetrinautAiMessage>;
