import type { ComponentType } from "react";

/**
 * Props passed to every interactive tool widget. The widget renders inline in
 * the AI chat while a tool call is awaiting human input, then becomes a
 * read-only summary once the user submits.
 */
export type InteractiveToolWidgetProps<Input, Output> = {
  /** Validated input supplied by the AI tool call. */
  input: Input;
  /** Submit one output for this tool call. Repeated calls are ignored. */
  submit: (output: Output) => void;
  /** Stable AI SDK identifier for this tool call. */
  toolCallId: string;
} & (
  | { state: "awaiting"; submittedOutput?: never }
  | { state: "submitted"; submittedOutput: Output }
);

/** A tool call as the interactive-tool registry sees it. */
export type InteractiveToolCall = {
  toolName: string;
  toolCallId: string;
  input: unknown;
};

/**
 * Descriptor for an AI tool that requires synchronous user input rendered
 * inline in the chat. The registry maps tool names to a definition; the chat
 * waits for the user on any tool call whose `shouldHandle` returns `true`, and
 * the transcript renders the registered {@link Widget} until the user submits.
 */
export type InteractiveToolDefinition<Input = unknown, Output = unknown> = {
  toolName: string;
  /**
   * Whether this tool call should be handled interactively. Lets a single
   * tool branch between interactive and non-interactive paths based on its
   * input shape (e.g. `applyAutoLayout` is interactive only when
   * `askUserFirst: true`).
   */
  shouldHandle: (input: unknown, call: { toolCallId: string }) => boolean;
  /** Parse the raw input into the widget's typed input. */
  parseInput: (raw: unknown) => Input;
  /** Parse the widget's output before submitting it to the AI SDK. */
  parseOutput: (raw: unknown) => Output;
  Widget: ComponentType<InteractiveToolWidgetProps<Input, Output>>;
};
