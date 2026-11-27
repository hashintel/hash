import { getValueSources } from "@local/hash-isomorphic-utils/flows/built-sources";

import { getNameLabel } from "./name-label";

import type {
  StepDefinition,
  ValueSource,
} from "@local/hash-isomorphic-utils/flows/types";

/** A flow input, or a step's output. */
export type FlowValue =
  | { kind: "flow-input"; inputName: string }
  | { kind: "step-output"; stepId: string; outputName: string };

/** A step that uses a value, and the properties of it that take the value, as people read them. */
export type ValueUse = { step: StepDefinition<string>; properties: string[] };

const getValueKey = (value: FlowValue) =>
  JSON.stringify(
    value.kind === "flow-input"
      ? [value.kind, value.inputName]
      : [value.kind, value.stepId, value.outputName],
  );

/** The value a source reads, if it reads a flow input or a step's output. */
const getSourceValue = (source: ValueSource | undefined): FlowValue | null =>
  source?.kind === "flow-input" || source?.kind === "step-output"
    ? source
    : null;

/**
 * Indexes the steps that use each value, at any depth, in the order they're listed: those with an input taking it,
 * for-each steps running over it, and a for-each step collecting it from a step inside it. Build it once per flow
 * definition and look up as many values as needed.
 */
export const indexValueUses = (
  steps: StepDefinition<string>[],
): ((value: FlowValue) => ValueUse[]) => {
  const usesByKey = new Map<string, ValueUse[]>();

  const visit = (step: StepDefinition<string>) => {
    const values: { property: string; value: FlowValue | null }[] =
      step.kind === "action"
        ? /* An input built from several values, such as an entity's properties, uses each of them. */
          Object.entries(step.inputs).flatMap(([inputName, source]) =>
            getValueSources(source).map((valueSource) => ({
              property: getNameLabel(inputName),
              value: getSourceValue(valueSource),
            })),
          )
        : [
            { property: "List", value: getSourceValue(step.over) },
            {
              property: "Collects",
              value: step.collect
                ? { kind: "step-output", ...step.collect }
                : null,
            },
          ];

    /* A step taking the same value in two properties is listed once, with both. */
    const propertiesByKey = new Map<string, string[]>();

    for (const { property, value } of values) {
      if (value) {
        const key = getValueKey(value);
        const properties = propertiesByKey.get(key) ?? [];

        propertiesByKey.set(
          key,
          properties.includes(property)
            ? properties
            : [...properties, property],
        );
      }
    }

    for (const [key, properties] of propertiesByKey) {
      usesByKey.set(key, [...(usesByKey.get(key) ?? []), { step, properties }]);
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
