import { getNamedInputSources } from "./shared/named-input-sources";

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

export const sortStepsTopologically = (
  possiblyNestedSteps: StepDefinition[],
): StepWithParallelParentId[] => {
  const sortedItems: StepDefinition[] = [];

  const stepsWithoutDependencies: StepDefinition[] = [];

  const dependencyCountByStepId: Map<string, number> = new Map();

  const steps = getFlattenedSteps(possiblyNestedSteps);

  for (const step of steps) {
    const dependencyCount = getNamedInputSources(step).filter(
      (input) => input.kind !== "constant" && input.kind !== "flow-input",
    ).length;

    dependencyCountByStepId.set(step.stepId, dependencyCount);

    if (dependencyCount === 0) {
      stepsWithoutDependencies.push(step);
    }
  }

  while (stepsWithoutDependencies.length > 0) {
    const readyStep = stepsWithoutDependencies.shift()!;

    sortedItems.push(readyStep);

    const stepsReducedToZeroDependenciesByReadyStep: string[] = [];

    for (const possiblyDependentStep of steps) {
      const numberOfDependenciesSatisfiedByReadyStep = getNamedInputSources(
        possiblyDependentStep,
      ).filter((input) => {
        if (input.kind === "item") {
          /**
           * An item is satisfied by the readyStep if the readyStep is the for-each step it is nested in
           */
          return (
            readyStep.kind === "for-each" &&
            possiblyDependentStep.parallelParentId === readyStep.stepId
          );
        }

        if (input.kind === "constant" || input.kind === "flow-input") {
          /** We excluded these from the dependency count when calculating it */
          return false;
        }

        const sourceStep = steps.find((step) => step.stepId === input.stepId);

        if (!sourceStep) {
          throw new Error(
            `Could not find source step with stepId ${input.stepId}`,
          );
        }

        if (sourceStep.kind === "for-each") {
          /**
           * If the source step is a for-each step, its outputs are only available once all of its children
           * have no dependencies left. This may be satisfied when any one of it or its children are processed.
           */
          return [sourceStep, ...sourceStep.steps].every(
            (step) =>
              /**
               * The final dependency of steps within a for-each step may have been reduced to zero in this iteration,
               * in which case we don't want to count a step dependent on the for-each step as being satisfied yet.
               * Any steps reduced to zero in this iteration will be processed in a future iteration,
               * at which point the step dependent on the for-each step can be pushed into the zero deps queue.
               */
              !stepsReducedToZeroDependenciesByReadyStep.includes(
                step.stepId,
              ) && dependencyCountByStepId.get(step.stepId) === 0,
          );
        }

        return input.stepId === readyStep.stepId;
      }).length;

      if (numberOfDependenciesSatisfiedByReadyStep) {
        const currentCount = dependencyCountByStepId.get(
          possiblyDependentStep.stepId,
        );

        if (currentCount === undefined) {
          throw new Error(
            `Dependency count for step with stepId ${possiblyDependentStep.stepId} is undefined`,
          );
        }

        const newCount =
          currentCount - numberOfDependenciesSatisfiedByReadyStep;
        dependencyCountByStepId.set(possiblyDependentStep.stepId, newCount);

        if (newCount === 0) {
          stepsWithoutDependencies.push(possiblyDependentStep);
          stepsReducedToZeroDependenciesByReadyStep.push(
            possiblyDependentStep.stepId,
          );
        }
      }
    }
  }

  const stepsWithCycles: string[] = [];
  for (const [stepId, count] of dependencyCountByStepId.entries()) {
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

/**
 * A topologically ordered list of groups of steps ('layers'), where each layer can execute once the previous is complete.
 */
type DependencyLayers = StepDefinition[][];

/**
 * A map of stepId to the index of the layer it is in.
 */
type DependencyLayerByStepId = Map<string, number>;

export const groupStepsByDependencyLayer = (
  untransformedSteps: StepDefinition[],
): { layers: DependencyLayers; layerByStepId: DependencyLayerByStepId } => {
  const layers: DependencyLayers = [];
  const layerByStepId: DependencyLayerByStepId = new Map();

  const sortedAndFlattenedSteps = sortStepsTopologically(untransformedSteps);

  for (const step of sortedAndFlattenedSteps) {
    let stepPlacedInLayer = false;

    for (let index = 0; index < layers.length; index++) {
      const layer = layers[index]!;

      const dependenciesAreInEarlierGroup = getNamedInputSources(step).every(
        (input) => {
          if (input.kind === "constant" || input.kind === "flow-input") {
            return true;
          }

          const inputSourceStepId =
            input.kind === "step-output"
              ? input.stepId
              : sortedAndFlattenedSteps.find(
                  (possibleParent) =>
                    possibleParent.kind === "for-each" &&
                    possibleParent.stepId === step.parallelParentId,
                )?.stepId;

          if (!inputSourceStepId) {
            throw new Error(
              `Could not find input source step for input '${input.inputName}' for step with stepId '${step.stepId}'`,
            );
          }

          const inputStep = sortedAndFlattenedSteps.find(
            (stp) => stp.stepId === inputSourceStepId,
          );
          if (!inputStep) {
            throw new Error(
              `Could not find input source step with stepId ${inputSourceStepId}`,
            );
          }

          const inputStepIds =
            inputStep.kind === "for-each"
              ? /**
                 * If the input is from a for-each step, all steps in it must be satisfied for this input to be
                 * considered satisfied.
                 *
                 * Technically this input is satisfied as soon as the nested step which produces the collected output
                 * is complete, and there may be leaf steps within the for-each step that do not contribute to that
                 * output, but that would make for a messy DAG visualization.
                 */
                [inputStep.stepId, ...inputStep.steps.map((stp) => stp.stepId)]
              : [inputStep.stepId];

          const inputIsSatisfied = inputStepIds.every((inputStepId) => {
            const inputGroupIndex = layerByStepId.get(inputStepId);

            if (inputGroupIndex === undefined) {
              throw new Error(
                `Source step with stepId ${inputStepId} does not appear before step with stepId ${step.stepId} – steps are not topologically sorted, or source is missing.`,
              );
            }

            /**
             * The input source is from a step that is in a previous layer
             */
            return inputGroupIndex < index;
          });

          return inputIsSatisfied;
        },
      );

      if (dependenciesAreInEarlierGroup) {
        layer.push(step);
        layerByStepId.set(step.stepId, index);
        stepPlacedInLayer = true;
        break;
      }
    }

    if (!stepPlacedInLayer) {
      layers.push([step]);
      layerByStepId.set(step.stepId, layers.length - 1);
    }
  }

  return { layers, layerByStepId };
};
