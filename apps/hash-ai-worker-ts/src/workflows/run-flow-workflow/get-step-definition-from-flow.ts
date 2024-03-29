import type {
  ActionStep,
  ActionStepDefinition,
  Flow,
  FlowStep,
  ParallelGroupStepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";
import { getAllStepDefinitionsInFlowDefinition } from "@local/hash-isomorphic-utils/flows/util";

/**
 * @todo: consider a more ergonomic way from mapping a step to its
 * corresponding flow definition node
 */
export const getStepDefinitionFromFlow = <T extends FlowStep>(params: {
  step: T;
  flow: Flow;
}): T extends ActionStep
  ? ActionStepDefinition<{
      inputName: string;
      kind: "parallel-group-input";
    }>
  : ParallelGroupStepDefinition => {
  const { step, flow } = params;

  const allStepDefinitions = getAllStepDefinitionsInFlowDefinition(
    flow.definition,
  );

  const [stepIdWithoutIndex] = step.stepId.split("~");

  const flowDefinitionNode = allStepDefinitions.find(
    ({ stepId }) => stepId === stepIdWithoutIndex,
  );

  if (!flowDefinitionNode) {
    throw new Error(
      `No flow definition step found for step with id ${step.stepId}`,
    );
  }

  return flowDefinitionNode as T extends ActionStep
    ? ActionStepDefinition<{
        inputName: string;
        kind: "parallel-group-input";
      }>
    : ParallelGroupStepDefinition;
};
