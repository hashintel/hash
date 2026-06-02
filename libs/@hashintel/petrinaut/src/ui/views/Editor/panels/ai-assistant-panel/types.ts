import type { AiToolOutput } from "./tool-summaries";
import type {
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
  PetrinautAiCommandToolInput,
  PetrinautAiCommandToolName,
  PetrinautAiMutationToolInput,
  PetrinautAiMutationToolName,
  PetrinautAiToolInput,
  readPetrinautDocToolName,
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
  [readPetrinautDocToolName]: {
    input: PetrinautAiToolInput<typeof readPetrinautDocToolName>;
    output: string;
  };
};

export type PetrinautAiMessage = UIMessage<
  unknown,
  UIDataTypes,
  PetrinautAiUiTools
>;

export type PetrinautAiTransport = ChatTransport<PetrinautAiMessage>;

/**
 * Provider metadata shape that the Petrinaut server-side transport attaches to
 * reasoning chunks so the UI can render an accurate elapsed time even after
 * the panel has been closed and reopened.
 *
 * The keys live under a `petrinaut` namespace inside the standard AI SDK
 * `providerMetadata` map. The SDK merges per-chunk metadata into the final
 * reasoning part, so reading either timestamp from the persisted message is
 * sufficient.
 */
export type PetrinautReasoningMetadata = {
  petrinaut?: {
    /** ms since epoch when the model started this reasoning summary. */
    startedAt?: number;
    /** ms since epoch when the model finished this reasoning summary. */
    finishedAt?: number;
  };
};
