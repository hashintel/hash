import type {
  StepDefinition,
  StepInputSource,
} from "@local/hash-isomorphic-utils/flows/types";

/**
 * A step input's source, with the name of the input it feeds.
 */
export type NamedStepInputSource = StepInputSource & { inputName: string };

/**
 * The sources of a step's inputs, as a list: an action step's connected inputs, or a for-each step's array
 * (as an input named `over`).
 */
export const getNamedInputSources = (
  step: StepDefinition,
): NamedStepInputSource[] =>
  step.kind === "action"
    ? Object.entries(step.inputs).map(([inputName, source]) => ({
        ...source,
        inputName,
      }))
    : [{ ...step.over, inputName: "over" }];
