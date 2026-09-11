import type {
  PetrinautDocHandle,
  PetrinautMutations,
} from "@hashintel/petrinaut-core";

/** Runtime parser used at a host-owned automatic dynamic-tool boundary. */
export type PetrinautAiAutomaticToolSchema<Value> = {
  parse: (value: unknown) => Value;
};

/** Capability passed to a host automatic tool: mutations plus the live handle. */
export type PetrinautAiAutomaticToolExecuteParams = {
  input: unknown;
  mutations: PetrinautMutations;
  handle: PetrinautDocHandle;
  toolCallId: string;
  signal: AbortSignal;
};

/** A host-owned dynamic tool that executes without an inline user interaction. */
export type PetrinautAiAutomaticTool = {
  /** Must match the dynamic tool name emitted by the host's AI transport. */
  toolName: string;
  inputSchema: PetrinautAiAutomaticToolSchema<unknown>;
  outputSchema: PetrinautAiAutomaticToolSchema<unknown>;
  /** Execute once; Petrinaut owns validated output insertion and continuation. */
  execute: (params: PetrinautAiAutomaticToolExecuteParams) => unknown;
};
