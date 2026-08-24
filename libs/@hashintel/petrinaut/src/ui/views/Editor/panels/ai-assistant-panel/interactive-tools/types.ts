import { createElement, type ComponentType, type ReactNode } from "react";

/**
 * Props passed to every interactive tool widget. The widget renders inline in
 * the AI chat while a tool call is awaiting human input, then becomes a
 * read-only summary once the user submits.
 */
export type InteractiveToolWidgetProps<
  Input,
  Submission,
  SubmittedOutput = Submission,
> = {
  /** Validated input the AI passed to the tool. */
  input: Input;
  /**
   * Submit a tool output to the chat. After submission, the widget remains
   * mounted in `submitted` state with the chosen output visible.
   */
  submit: (submission: Submission) => void;
  /** "awaiting" while the user has not yet picked; "submitted" afterwards. */
  state: "awaiting" | "submitted";
  /** Output that was submitted (only set when `state === "submitted"`). */
  submittedOutput?: SubmittedOutput;
};

/**
 * Descriptor for an AI tool that requires synchronous user input rendered
 * inline in the chat. The registry maps tool names to a definition; the panel
 * dispatcher defers `onToolCall` for any tool whose `shouldHandle` returns
 * `true`, and the surface renders the registered {@link Widget} until the
 * user submits.
 */
export type InteractiveToolDefinition<
  Input = unknown,
  Submission = unknown,
  SubmittedOutput = Submission,
  ToolName extends string = string,
> = {
  toolName: ToolName;
  /**
   * Whether this tool call should be handled interactively. Lets a single
   * tool branch between interactive and non-interactive paths based on its
   * input shape (e.g. `applyAutoLayout` is interactive only when
   * `askUserFirst: true`).
   */
  shouldHandle: (input: unknown) => boolean;
  /** Parse the raw input into the widget's typed input. */
  parseInput: (raw: unknown) => Input;
  /** Parse a persisted tool output into the widget's read-only result view. */
  parseOutput: (raw: unknown) => SubmittedOutput;
  Widget: ComponentType<
    InteractiveToolWidgetProps<Input, Submission, SubmittedOutput>
  >;
};

/**
 * Opaque host capability consumed by the heterogeneous interactive-tool
 * registry. Host-specific input and output types stay sealed inside
 * {@link definePetrinautAiInteractiveTool}.
 */
export type PetrinautAiInteractiveTool = {
  readonly toolName: string;
  shouldHandle(input: unknown): boolean;
  render(props: InteractiveToolWidgetProps<unknown, unknown>): ReactNode;
};

export const definePetrinautAiInteractiveTool = <Input, Output>(
  definition: InteractiveToolDefinition<Input, Output>,
): PetrinautAiInteractiveTool => ({
  toolName: definition.toolName,
  shouldHandle: definition.shouldHandle,
  render: ({ input, state, submit, submittedOutput }) => {
    let parsedInput: Input;
    try {
      parsedInput = definition.parseInput(input);
    } catch {
      return null;
    }
    let parsedOutput: Output | undefined;
    if (state === "submitted") {
      try {
        parsedOutput = definition.parseOutput(submittedOutput);
      } catch {
        parsedOutput = undefined;
      }
    }
    return createElement(definition.Widget, {
      input: parsedInput,
      state,
      submit: (output: Output) => submit(output),
      submittedOutput: parsedOutput,
    });
  },
});
