import type { PetrinautAiAssistantPresentation } from "./petrinaut-ai-assistant";
import type { ComponentType } from "react";

/** A runtime parser such as a Zod schema. */
type PetrinautAiInteractiveToolSchema<Value> = {
  parse: (value: unknown) => Value;
};

type InteractiveToolWidgetCommonProps<Input, Output> = {
  /** Assistant presentation selected by the embedding host. */
  presentation?: PetrinautAiAssistantPresentation;
  /** Validated input supplied by the AI tool call. */
  input: Input;
  /** Submit one output for this tool call. Repeated calls are ignored. */
  submit: (output: Output) => void;
  /**
   * Submit and await host acceptance. Rejects when this rendered call has no
   * local completion authority. Repeated calls are ignored.
   */
  submitAndWait?: (output: Output) => Promise<void>;
  /** Stable AI SDK identifier for this tool call. */
  toolCallId: string;
};

/** Props supplied to a host's inline interactive-tool component. */
export type PetrinautAiInteractiveToolWidgetProps<Input, Output> =
  InteractiveToolWidgetCommonProps<Input, Output> &
    (
      | {
          state: "awaiting";
          submittedOutput?: never;
        }
      | {
          state: "submitted";
          submittedOutput: Output;
        }
    );

/**
 * Definition of a host-owned dynamic AI tool rendered inline in Petrinaut's
 * chat panel.
 */
type PetrinautAiInteractiveToolDefinition<Input, Output> = {
  /** Must match the dynamic tool name emitted by the host's AI transport. */
  toolName: string;
  /** Produced cards stay below the answer rather than inside the work fold. */
  placement?: "work" | "card";
  /** Runtime contract for the tool-call input. */
  inputSchema: PetrinautAiInteractiveToolSchema<Input>;
  /** Runtime contract for the widget's submitted output. */
  outputSchema: PetrinautAiInteractiveToolSchema<Output>;
  /**
   * Render an interaction only for matching call identities. Defaults to all.
   * This runs during render without parsing the input; when it
   * depends on host state, rebuild `interactiveTools` as that state changes.
   *
   * Declining only suppresses the widget for tools the host executes itself
   * (`inBandBrowserTools`). Any other registered tool is completed solely by
   * its widget, so a declined call fails rather than waiting for a result.
   */
  shouldHandle?: (call: { toolCallId: string }) => boolean;
  /**
   * Optionally map text submitted through the assistant composer to this
   * tool's output. Petrinaut validates both the pending input and mapped
   * output before completing the tool call.
   */
  fromComposerText?: (params: { input: Input; text: string }) => Output;
  /** Inline component shown while awaiting input and after submission. */
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

/** Opaque, type-safe registration accepted by `AssistantChat`'s `interactiveTools`. */
export type PetrinautAiInteractiveTool = {
  readonly toolName: string;
  readonly [interactiveToolDefinition]: ErasedInteractiveToolDefinition;
};

/**
 * Define a host-owned interactive AI tool while preserving the relationship
 * between its schemas and component props.
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

/** @internal */
export const getPetrinautAiInteractiveToolDefinition = (
  tool: PetrinautAiInteractiveTool,
): ErasedInteractiveToolDefinition => tool[interactiveToolDefinition];
