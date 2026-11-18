import type { StepDefinition } from "@local/hash-isomorphic-utils/flows/types";

type StepWithParallelParentId = StepDefinition & { parallelParentId?: string };

export const getFlattenedSteps = (
  steps: StepDefinition[],
  parallelParentId?: string,
): StepWithParallelParentId[] => {
  const flattenedSteps: StepWithParallelParentId[] = [];

  for (const step of steps) {
    flattenedSteps.push({
      ...step,
      parallelParentId,
    });

    if (step.kind === "for-each") {
      flattenedSteps.push(...getFlattenedSteps(step.steps, step.stepId));
    }
  }

  return flattenedSteps;
};
