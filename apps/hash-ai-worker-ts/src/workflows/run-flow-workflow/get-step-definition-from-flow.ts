import type {
  ActionStep,
  ActionStepDefinition,
  FlowDefinition,
  FlowStep,
  ParallelGroupStepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";
import { getAllStepDefinitionsInFlowDefinition } from "@local/hash-isomorphic-utils/flows/util";

/**
 * @todo: consider a more ergonomic way from mapping a step to its
 * corresponding flow definition node
 */
export const getStepDefinitionFromFlowDefinition = <
  T extends FlowStep,
>(params: {
  step: T;
  flowDefinition: FlowDefinition;
}): T extends ActionStep
  ? ActionStepDefinition<{
      inputName: string;
      kind: "parallel-group-input";
    }>
  : ParallelGroupStepDefinition => {
  const { step, flowDefinition } = params;

  const allStepDefinitions =
    getAllStepDefinitionsInFlowDefinition(flowDefinition);

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
