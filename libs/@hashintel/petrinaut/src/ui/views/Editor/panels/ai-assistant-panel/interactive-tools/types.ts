import type { PetrinautAiInteractiveToolWidgetProps } from "../../../../../types/ai-interactive-tool";
import type { ComponentType } from "react";

/**
 * Props passed to every interactive tool widget. The widget renders inline in
 * the AI chat while a tool call is awaiting human input, then becomes a
 * read-only summary once the user submits.
 */
export type InteractiveToolWidgetProps<Input, Output> =
  PetrinautAiInteractiveToolWidgetProps<Input, Output>;

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
  /** Parse the widget's output before submitting it to the AI SDK. */
  parseOutput: (raw: unknown) => Output;
  /** Map composer text to a validated tool output when the host opts in. */
  fromComposerText?: (params: { input: Input; text: string }) => Output;
  Widget: ComponentType<InteractiveToolWidgetProps<Input, Output>>;
};
