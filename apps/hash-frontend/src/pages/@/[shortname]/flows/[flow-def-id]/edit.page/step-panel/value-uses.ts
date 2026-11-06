import type {
  StepDefinition,
  StepInputSource,
} from "@local/hash-isomorphic-utils/flows/types";

/** A flow input, or a step's output. */
export type FlowValue =
  | { kind: "flow-input"; inputName: string }
  | { kind: "step-output"; stepId: string; outputName: string };

const getValueKey = (value: FlowValue) =>
  JSON.stringify(
    value.kind === "flow-input"
      ? [value.kind, value.inputName]
      : [value.kind, value.stepId, value.outputName],
  );

/** The value a source reads, if it reads a flow input or a step's output. */
const getSourceValue = (source: StepInputSource): FlowValue | null =>
  source.kind === "flow-input" || source.kind === "step-output" ? source : null;

/**
 * Indexes the steps that use each value, at any depth, in the order they're listed: those with an input taking it,
 * for-each steps running over it, and a for-each step collecting it from a step inside it. Build it once per flow
 * definition and look up as many values as needed.
 */
export const indexValueUses = (
  steps: StepDefinition<string>[],
): ((value: FlowValue) => StepDefinition<string>[]) => {
  const usesByKey = new Map<string, StepDefinition<string>[]>();

  const visit = (step: StepDefinition<string>) => {
    const values =
      step.kind === "action"
        ? Object.values(step.inputs).map(getSourceValue)
        : [
            getSourceValue(step.over),
            { kind: "step-output" as const, ...step.collect },
          ];

    /* A step taking the same value in two inputs is listed once. */
    const keys = new Set(
      values.flatMap((value) => (value ? [getValueKey(value)] : [])),
    );

    for (const key of keys) {
      usesByKey.set(key, [...(usesByKey.get(key) ?? []), step]);
    }

    if (step.kind === "for-each") {
      for (const innerStep of step.steps) {
        visit(innerStep);
      }
    }
  };

  for (const step of steps) {
    visit(step);
  }

  return (value) => usesByKey.get(getValueKey(value)) ?? [];
};
