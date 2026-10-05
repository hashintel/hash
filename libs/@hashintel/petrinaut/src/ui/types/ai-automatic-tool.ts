import type { FrameSceneResult } from "../views/SDCPN/canvas-renderer";
import type {
  PetrinautCommands,
  PetrinautDocHandle,
  PetrinautMutations,
} from "@hashintel/petrinaut-core";

/** Outcome of framing the net: `framed`, `empty`, `no-renderer` or `timed-out`. */
export type PetrinautAiViewportFrameResult = FrameSceneResult;

/** A parser that checks an unknown value and returns it typed, like a Zod schema. */
export type PetrinautAiAutomaticToolSchema<Value> = {
  /** Returns the value typed, or throws when it is invalid. */
  parse: (value: unknown) => Value;
};

/** What `execute` receives: the parsed input and the open net's editing APIs. */
export type PetrinautAiAutomaticToolExecuteParams = {
  /** The tool call's input, parsed by `inputSchema`. */
  input: unknown;
  /** Functions that edit the open net. */
  mutations: PetrinautMutations;
  /** Editor commands on the open net, such as auto layout. */
  commands: PetrinautCommands;
  /** Document handle of the open net. */
  handle: PetrinautDocHandle;
  /**
   * Reads the net's current TypeScript diagnostics as text for the model.
   * If the net changes while they run, resolves with a note to check again.
   */
  readDiagnosticsContext: () => Promise<string>;
  /** Viewport actions of the mounted editor. */
  viewport: {
    /**
     * Fits the whole net in view after the next render.
     * Resolves `no-renderer` when no canvas is mounted.
     */
    frameSceneAfterRender: () => Promise<PetrinautAiViewportFrameResult>;
  };
  /** Id of this tool call, from the AI SDK. */
  toolCallId: string;
  /**
   * Aborts when the user stops the reply, sends a new message, clears the chat
   * or switches conversation. Output returned after an abort is discarded.
   */
  signal: AbortSignal;
};

/**
 * An AI tool that runs without user input and returns its output to the chat.
 * List it in `PetrinautAiAssistant.automaticTools`.
 */
export type PetrinautAiAutomaticTool = {
  /** Must match the dynamic tool name the transport emits. */
  toolName: string;
  /** Whether the call shows in the transcript. Defaults to `visible`. */
  visibility?: "visible" | "hidden";
  /** Validates the tool call's input before `execute` runs. */
  inputSchema: PetrinautAiAutomaticToolSchema<unknown>;
  /** Validates the value `execute` returns before the chat records it. */
  outputSchema: PetrinautAiAutomaticToolSchema<unknown>;
  /**
   * Runs the tool once per call and may return a promise.
   * Petrinaut validates the result, records it and continues the turn.
   */
  execute: (params: PetrinautAiAutomaticToolExecuteParams) => unknown;
};
