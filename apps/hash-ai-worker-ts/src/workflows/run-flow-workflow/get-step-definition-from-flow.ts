import type {
  ActionStep,
  ActionStepDefinition,
  Flow,
  FlowStep,
  ParallelGroupStepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";

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

  const allStepDefinitions = [
    ...flow.definition.steps,
    ...flow.definition.steps.flatMap((stepDefinition) =>
      stepDefinition.kind === "parallel-group" ? stepDefinition.steps : [],
    ),
  ];

  const flowDefinitionNode = allStepDefinitions.find(
    ({ stepId }) => stepId === step.stepId.split("~")[0],
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
