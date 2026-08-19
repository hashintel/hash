import type { ComponentType } from "react";

/** A runtime parser such as a Zod schema. */
export type PetrinautAiInteractiveToolSchema<Value> = {
  parse: (value: unknown) => Value;
};

type InteractiveToolWidgetCommonProps<Input, Output> = {
  /** Validated input supplied by the AI tool call. */
  input: Input;
  /** Submit one output for this tool call. Repeated calls are ignored. */
  submit: (output: Output) => void;
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
export type PetrinautAiInteractiveToolDefinition<Input, Output> = {
  /** Must match the dynamic tool name emitted by the host's AI transport. */
  toolName: string;
  /** Runtime contract for the tool-call input. */
  inputSchema: PetrinautAiInteractiveToolSchema<Input>;
  /** Runtime contract for the widget's submitted output. */
  outputSchema: PetrinautAiInteractiveToolSchema<Output>;
  /** Inline component shown while awaiting input and after submission. */
  component: ComponentType<
    PetrinautAiInteractiveToolWidgetProps<Input, Output>
  >;
};

type ErasedInteractiveToolDefinition = {
  toolName: string;
  parseInput: (value: unknown) => unknown;
  parseOutput: (value: unknown) => unknown;
  component: ComponentType<
    PetrinautAiInteractiveToolWidgetProps<unknown, unknown>
  >;
};

const interactiveToolDefinition = Symbol("PetrinautAiInteractiveTool");

/** Opaque, type-safe registration accepted by `aiAssistant.interactiveTools`. */
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
): PetrinautAiInteractiveTool => ({
  toolName: definition.toolName,
  [interactiveToolDefinition]: {
    toolName: definition.toolName,
    parseInput: (value) => definition.inputSchema.parse(value),
    parseOutput: (value) => definition.outputSchema.parse(value),
    component: definition.component as ComponentType<
      PetrinautAiInteractiveToolWidgetProps<unknown, unknown>
    >,
  },
});

/** @internal */
export const getPetrinautAiInteractiveToolDefinition = (
  tool: PetrinautAiInteractiveTool,
): ErasedInteractiveToolDefinition => tool[interactiveToolDefinition];
