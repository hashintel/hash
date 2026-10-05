import type { PetrinautAiAssistantPresentation } from "../petrinaut";
import type { ComponentType } from "react";

/** A parser that checks an unknown value and returns it typed, like a Zod schema. */
export type PetrinautAiInteractiveToolSchema<Value> = {
  /** Returns the value typed, or throws when it is invalid. */
  parse: (value: unknown) => Value;
};

type InteractiveToolWidgetCommonProps<Input, Output> = {
  /** The assistant's presentation, `stock` or `brunch`, for styling the widget. */
  presentation?: PetrinautAiAssistantPresentation;
  /** The tool call's input, parsed by `inputSchema`. */
  input: Input;
  /** Answers the call with this output. Later calls are ignored unless it fails. */
  submit: (output: Output) => void;
  /**
   * Like `submit`, but resolves once the chat has recorded the output.
   * Rejects if the output fails `outputSchema` or the call is display-only,
   * such as one observed through `followMessages`.
   */
  submitAndWait?: (output: Output) => Promise<void>;
  /** Id of this tool call, from the AI SDK. */
  toolCallId: string;
};

/**
 * Props of an interactive tool's widget, while it awaits an answer and after.
 * @typeParam Input - The tool call's input, as `inputSchema` returns it.
 * @typeParam Output - The widget's answer, as `outputSchema` returns it.
 */
export type PetrinautAiInteractiveToolWidgetProps<Input, Output> =
  InteractiveToolWidgetCommonProps<Input, Output> &
    (
      | {
          /** `awaiting`: the call waits for the user's answer. */
          state: "awaiting";
          /** Absent until the call is answered. */
          submittedOutput?: never;
        }
      | {
          /** `submitted`: the call is answered, so render it read-only. */
          state: "submitted";
          /** The output that answered the call, parsed by `outputSchema`. */
          submittedOutput: Output;
        }
    );

/**
 * An AI tool the user answers through a widget shown inline in the chat.
 * Pass it to `definePetrinautAiInteractiveTool`.
 * @typeParam Input - The tool call's input, as `inputSchema` returns it.
 * @typeParam Output - The widget's answer, as `outputSchema` returns it.
 */
export type PetrinautAiInteractiveToolDefinition<Input, Output> = {
  /**
   * Must match the dynamic tool name the transport emits.
   * Must be unique, and must not reuse a built-in tool's name.
   */
  toolName: string;
  /**
   * Where the Brunch presentation shows the widget: among the turn's work, or
   * as a card below the answer. Defaults to `work`.
   */
  placement?: "work" | "card";
  /** Validates the tool call's input before the widget receives it. */
  inputSchema: PetrinautAiInteractiveToolSchema<Input>;
  /** Validates the widget's answer before the chat records it. */
  outputSchema: PetrinautAiInteractiveToolSchema<Output>;
  /**
   * Whether the widget handles this call. Defaults to every call.
   * Runs during render: rebuild `interactiveTools` when the state it reads changes.
   * A declined call fails unless `inBandBrowserTools` runs it.
   */
  shouldHandle?: (call: { toolCallId: string }) => boolean;
  /**
   * Turns text sent through the composer, typed or spoken, into a pending call's output.
   * Text that several pending calls accept is rejected.
   */
  fromComposerText?: (params: { input: Input; text: string }) => Output;
  /** The widget, shown while the call awaits an answer and read-only after. */
  component: ComponentType<
    PetrinautAiInteractiveToolWidgetProps<Input, Output>
  >;
};

type ErasedInteractiveToolDefinition = {
  toolName: string;
  placement?: "work" | "card";
  parseInput: (value: unknown) => unknown;
  parseOutput: (value: unknown) => unknown;
  shouldHandle?: (call: { toolCallId: string }) => boolean;
  fromComposerText?: (params: { input: unknown; text: string }) => unknown;
  component: ComponentType<
    PetrinautAiInteractiveToolWidgetProps<unknown, unknown>
  >;
};

const interactiveToolDefinition = Symbol("PetrinautAiInteractiveTool");

/**
 * An interactive tool for `PetrinautAiAssistant.interactiveTools`.
 * Create one with `definePetrinautAiInteractiveTool`.
 */
export type PetrinautAiInteractiveTool = {
  /** Name of the dynamic tool this widget answers. */
  readonly toolName: string;
  /** The definition Petrinaut reads. */
  readonly [interactiveToolDefinition]: ErasedInteractiveToolDefinition;
};

/**
 * Creates an interactive tool for `PetrinautAiAssistant.interactiveTools`.
 * The widget's props are typed from `inputSchema` and `outputSchema`.
 */
export const definePetrinautAiInteractiveTool = <Input, Output>(
  definition: PetrinautAiInteractiveToolDefinition<Input, Output>,
): PetrinautAiInteractiveTool => {
  const fromComposerText = definition.fromComposerText;
  const shouldHandle = definition.shouldHandle;

  return {
    toolName: definition.toolName,
    [interactiveToolDefinition]: {
      toolName: definition.toolName,
      placement: definition.placement,
      parseInput: (value) => definition.inputSchema.parse(value),
      parseOutput: (value) => definition.outputSchema.parse(value),
      shouldHandle,
      fromComposerText: fromComposerText
        ? ({ input, text }) =>
            definition.outputSchema.parse(
              fromComposerText({
                input: definition.inputSchema.parse(input),
                text,
              }),
            )
        : undefined,
      component: definition.component as ComponentType<
        PetrinautAiInteractiveToolWidgetProps<unknown, unknown>
      >,
    },
  };
};

/**
 * Reads the definition stored in an interactive tool.
 * @internal
 */
export const getPetrinautAiInteractiveToolDefinition = (
  tool: PetrinautAiInteractiveTool,
): ErasedInteractiveToolDefinition => tool[interactiveToolDefinition];
