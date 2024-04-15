import type { StepDefinition } from "@local/hash-isomorphic-utils/flows/types";

export const sortStepsTopologically = (
  steps: StepDefinition[],
): StepDefinition[] => {
  const sortedItems: StepDefinition[] = [];

  const itemsWithoutDependencies: StepDefinition[] = [];

  const dependencyCount: Map<string, number> = new Map();

  for (const step of steps) {
    const dependencyCount = step.inputSources.length;
    dependencyCount.set(step.stepId, step.inputSources.length);

    if (dependencyCount === 0) {
      itemsWithoutDependencies.push(step);
    }
  }

  while (itemsWithoutDependencies.length > 0) {
    const currentItem = itemsWithoutDependencies.shift()!;
    sortedItems.push(currentItem);
    currentItem.outputs.forEach((output) => {
      for (const possiblyDependentItem of steps) {
        if (
          possiblyDependentItem.inputSources.some(
            (input) => input.sourceStepId === currentItem.stepId,
          )
        ) {
          const currentCount = dependencyCount.get(
            possiblyDependentItem.stepId,
          );
          if (currentCount !== undefined) {
            const newCount = currentCount - 1;
            dependencyCount.set(possiblyDependentItem.stepId, newCount);
            if (newCount === 0) {
              itemsWithoutDependencies.push(possiblyDependentItem);
            }
          }
        }
      }
    });
  }

  const stepsWithCycles: string[] = [];
  for (const [stepId, count] of dependencyCount.entries()) {
    if (count > 0) {
      stepsWithCycles.push(stepId);
    }
  }

  if (stepsWithCycles.length > 0) {
    throw new Error(
      `Cycles detected in steps with stepIds: ${stepsWithCycles.join(", ")}`,
    );
  }

  return sortedItems;
};

export const groupStepsByDependencyLayer = (
  steps: StepDefinition[],
): StepDefinition[][] => {
  const groups: StepDefinition[][] = [];
  const groupByStepId: Map<string, number> = new Map();

  const sortedSteps = sortStepsTopologically(steps);

  for (const step of sortedSteps) {
    let stepPlacedInGroup = false;

    for (let index = 0; index < groups.length; index++) {
      const group = groups[index];
      if (
        step.inputSources.every((input) => {
          if (input.kind === "hardcoded") {
            return true;
          }

          const inputGroupIndex = groupByStepId.get(input.sourceStepId);

          if (inputGroupIndex === undefined) {
            throw new Error(
              `Source step with stepId ${input.sourceStepId} does not appear before step with stepId ${step.stepId} – steps are not topologically sorted, or source is missing.`,
            );
          }

          /**
           * The input source is from a step that is in a previous group
           */
          return inputGroupIndex < index;
        })
      ) {
        if (!group) {
          throw new Error(`Layer at index ${index} is undefined`);
        }

        group.push(step);
        groupByStepId.set(step.stepId, index);
        stepPlacedInGroup = true;
        break;
      }
    }

    if (!stepPlacedInGroup) {
      groups.push([step]);
      groupByStepId.set(step.stepId, groups.length - 1);
    }
  }

  return groups;
};
