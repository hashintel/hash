import { getAllStepDefinitionsInFlowDefinition } from "@local/hash-isomorphic-utils/flows/util";

import type {
  ActionStep,
  ActionStepDefinition,
  FlowDefinition,
  FlowStep,
  ForEachStepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";

/**
 * The definition of a step in a run. A step in a branch of a for-each step has the id of its definition,
 * suffixed with `~<item index>`.
 */
export const getStepDefinitionFromFlowDefinition = <
  T extends FlowStep,
>(params: {
  step: T;
  flowDefinition: FlowDefinition;
}): T extends ActionStep ? ActionStepDefinition : ForEachStepDefinition => {
  const { step, flowDefinition } = params;

  const [stepIdWithoutIndex] = step.stepId.split("~");

  const stepDefinition = getAllStepDefinitionsInFlowDefinition(
    flowDefinition,
  ).find(({ stepId }) => stepId === stepIdWithoutIndex);

  if (!stepDefinition) {
    throw new Error(
      `No flow definition step found for step with id ${step.stepId}`,
    );
  }

  return stepDefinition as T extends ActionStep
    ? ActionStepDefinition
    : ForEachStepDefinition;
};
