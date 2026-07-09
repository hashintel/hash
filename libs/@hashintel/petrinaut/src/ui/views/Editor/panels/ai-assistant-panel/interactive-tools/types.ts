import type { ComponentType } from "react";

/**
 * Props passed to every interactive tool widget. The widget renders inline in
 * the AI chat while a tool call is awaiting human input, then becomes a
 * read-only summary once the user submits.
 */
export type InteractiveToolWidgetProps<Input, Output> = {
  /** Validated input the AI passed to the tool. */
  input: Input;
  /**
   * Submit a tool output to the chat. After submission, the widget remains
   * mounted in `submitted` state with the chosen output visible.
   */
  submit: (output: Output) => void;
  /** "awaiting" while the user has not yet picked; "submitted" afterwards. */
  state: "awaiting" | "submitted";
  /** Output that was submitted (only set when `state === "submitted"`). */
  submittedOutput?: Output;
};

/**
 * Descriptor for an AI tool that requires synchronous user input rendered
 * inline in the chat. The registry maps tool names to a definition; the panel
 * dispatcher defers `onToolCall` for any tool whose `shouldHandle` returns
 * `true`, and the surface renders the registered {@link Widget} until the
 * user submits.
 */
export type InteractiveToolDefinition<Input = unknown, Output = unknown> = {
  toolName: string;
  /**
   * Whether this tool call should be handled interactively. Lets a single
   * tool branch between interactive and non-interactive paths based on its
   * input shape (e.g. `applyAutoLayout` is interactive only when
   * `askUserFirst: true`).
   */
  shouldHandle: (input: unknown) => boolean;
  /** Parse the raw input into the widget's typed input. */
  parseInput: (raw: unknown) => Input;
  Widget: ComponentType<InteractiveToolWidgetProps<Input, Output>>;
};
