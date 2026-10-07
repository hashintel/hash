import type { FrameSceneResult } from "../views/SDCPN/canvas-renderer";
import type {
  PetrinautCommands,
  PetrinautDocHandle,
  PetrinautMutations,
} from "@hashintel/petrinaut-core";

export type PetrinautAiViewportFrameResult = FrameSceneResult;

/** Runtime parser used at a host-owned automatic dynamic-tool boundary. */
export type PetrinautAiAutomaticToolSchema<Value> = {
  parse: (value: unknown) => Value;
};

/**
 * Capability passed to a host automatic tool: the same mutations, commands,
 * handle and diagnostics the built-in assistant tools execute against.
 */
export type PetrinautAiAutomaticToolExecuteParams = {
  input: unknown;
  mutations: PetrinautMutations;
  commands: PetrinautCommands;
  handle: PetrinautDocHandle;
  /**
   * The editor's current TypeScript diagnostics formatted for the model, as
   * the built-in compilation read reports them. Waits, within a bound, for
   * diagnostics to catch up with the latest tool-applied change and reports
   * them as pending instead of describing an earlier version.
   */
  readDiagnosticsContext: () => Promise<string>;
  /** Renderer-neutral viewport operations owned by the mounted editor. */
  viewport: {
    frameSceneAfterRender: () => Promise<PetrinautAiViewportFrameResult>;
  };
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
