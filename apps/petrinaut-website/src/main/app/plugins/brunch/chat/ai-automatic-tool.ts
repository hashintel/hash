import type { PetrinautDocHandle } from "@hashintel/petrinaut-core";
import type { PluginEdits } from "@hashintel/petrinaut/ui/plugin";

/**
 * Runtime parser used at a host-owned automatic dynamic-tool boundary.
 */
export type PetrinautAiAutomaticToolSchema<Value> = {
  parse: (value: unknown) => Value;
};

/**
 * Capability passed to a host automatic tool: the plugin's refusal-aware
 * edits, the document handle the host bound the assistant to, and the
 * diagnostics the built-in tools read. Raw mutations, commands and viewport
 * framing are not part of the plugin API, so they are not offered here.
 */
export type PetrinautAiAutomaticToolExecuteParams = {
  input: unknown;
  /** Refused while the editor is read-only; never pass as `PetrinautMutations`. */
  edit: PluginEdits;
  /** The host's bound document handle, from `PetrinautAiAssistant.documentHandle`. */
  handle: PetrinautDocHandle;
  /**
   * The editor's current TypeScript diagnostics formatted for the model, as
   * the built-in compilation read reports them. Waits, within a bound, for
   * diagnostics to catch up with the latest tool-applied change and reports
   * them as pending instead of describing an earlier version.
   */
  readDiagnosticsContext: () => Promise<string>;
  toolCallId: string;
  signal: AbortSignal;
};

/**
 * A host-owned dynamic tool that executes without an inline user interaction.
 */
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
