import { getStepDisplay } from "./step-display";

import type { StepDefinition } from "@local/hash-isomorphic-utils/flows/types";

/** A step at any depth, and whether it's inside a for-each step, and so read-only. */
export const findStep = (
  steps: StepDefinition<string>[],
  stepId: string,
  inner = false,
): { step: StepDefinition<string>; inner: boolean } | undefined => {
  for (const step of steps) {
    if (step.stepId === stepId) {
      return { step, inner };
    }

    if (step.kind === "for-each") {
      const found = findStep(step.steps, stepId, true);

      if (found) {
        return found;
      }
    }
  }

  return undefined;
};

/** The for-each steps a step is inside, outermost first; none for a step at the top level or one that doesn't exist. */
export const getEnclosingStepIds = (
  steps: StepDefinition<string>[],
  stepId: string,
): string[] => {
  for (const step of steps) {
    if (step.kind === "for-each" && findStep(step.steps, stepId)) {
      return [step.stepId, ...getEnclosingStepIds(step.steps, stepId)];
    }
  }

  return [];
};

/** What a step is called where it's named, e.g. in a chip: its description, else its action's name. */
export const getStepName = (step: StepDefinition<string>) => {
  const { title, description } = getStepDisplay(step);

  return description || title;
};
