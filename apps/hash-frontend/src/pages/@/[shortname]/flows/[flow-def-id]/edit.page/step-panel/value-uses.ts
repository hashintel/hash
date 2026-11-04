import type {
  StepDefinition,
  StepInputSource,
} from "@local/hash-isomorphic-utils/flows/types";

/** A flow input, or a step's output. */
export type FlowValue =
  | { kind: "flow-input"; inputName: string }
  | { kind: "step-output"; stepId: string; outputName: string };

const isValue = (source: StepInputSource, value: FlowValue) =>
  value.kind === "flow-input"
    ? source.kind === "flow-input" && source.inputName === value.inputName
    : source.kind === "step-output" &&
      source.stepId === value.stepId &&
      source.outputName === value.outputName;

/**
 * The steps that use a value, at any depth, in the order they're listed: those with an input taking it, for-each
 * steps running over it, and a for-each step collecting it from a step inside it.
 */
export const getStepsUsingValue = (
  steps: StepDefinition<string>[],
  value: FlowValue,
): StepDefinition<string>[] =>
  steps.flatMap((step) => {
    const usesValue =
      step.kind === "action"
        ? Object.values(step.inputs).some((source) => isValue(source, value))
        : isValue(step.over, value) ||
          isValue({ kind: "step-output", ...step.collect }, value);

    return [
      ...(usesValue ? [step] : []),
      ...(step.kind === "for-each"
        ? getStepsUsingValue(step.steps, value)
        : []),
    ];
  });
