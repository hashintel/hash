/** Runtime parser used at a host-owned automatic dynamic-tool boundary. */
type PetrinautAiAutomaticToolSchema<Value> = {
  parse: (value: unknown) => Value;
};

/** One call of a host automatic tool, which reaches the editor through its plugin's `api`. */
export type PetrinautAiAutomaticToolExecuteParams = {
  input: unknown;
  toolCallId: string;
  signal: AbortSignal;
};

/** A host-owned dynamic tool that executes without an inline user interaction. */
export type PetrinautAiAutomaticTool = {
  /** Must match the dynamic tool name emitted by the host's AI transport. */
  toolName: string;
  /** Whether this implementation detail appears in the transcript. Defaults to visible. */
  visibility?: "visible" | "hidden";
  inputSchema: PetrinautAiAutomaticToolSchema<unknown>;
  outputSchema: PetrinautAiAutomaticToolSchema<unknown>;
  /** Execute once; the chat owns validated output insertion and continuation. */
  execute: (params: PetrinautAiAutomaticToolExecuteParams) => unknown;
};
