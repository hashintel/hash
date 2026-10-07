import type { PluginEdits } from "@hashintel/petrinaut/ui";

/** Runtime parser used at a host-owned automatic dynamic-tool boundary. */
type PetrinautAiAutomaticToolSchema<Value> = {
  parse: (value: unknown) => Value;
};

/**
 * Capability passed to a host automatic tool: the same edits and diagnostics
 * the built-in assistant tools execute against.
 */
export type PetrinautAiAutomaticToolExecuteParams = {
  input: unknown;
  /** The document's edits, each refused while the editor is read-only. */
  edit: PluginEdits;
  /**
   * The editor's current TypeScript diagnostics formatted for the model, as
   * the built-in compilation read reports them.
   */
  readDiagnosticsContext: () => Promise<string>;
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
  /** Execute once; Petrinaut owns validated output insertion and continuation. */
  execute: (params: PetrinautAiAutomaticToolExecuteParams) => unknown;
};
