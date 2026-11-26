import { getStepDisplay } from "./step-display";

import type {
  ForEachStepDefinition,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";

/** A step at any depth, and the for-each step it's directly inside, if any. */
export const findStep = (
  steps: StepDefinition<string>[],
  stepId: string,
  parent: ForEachStepDefinition<string> | null = null,
):
  | {
      step: StepDefinition<string>;
      parent: ForEachStepDefinition<string> | null;
    }
  | undefined => {
  for (const step of steps) {
    if (step.stepId === stepId) {
      return { step, parent };
    }

    if (step.kind === "for-each") {
      const found = findStep(step.steps, stepId, step);

      if (found) {
        return found;
      }
    }
  }

  return undefined;
};

/** What a step is called where it's named, e.g. in a chip: its description, else its action's name. */
export const getStepName = (step: StepDefinition<string>) => {
  const { title, description } = getStepDisplay(step);

  return description || title;
};
