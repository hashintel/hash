import type {
  FlowActionDefinitionId,
  FlowDefinition,
  StepDefinition,
} from "./types.js";

/**
 * Every step of a flow definition, including those nested in for-each steps.
 */
export const getAllStepDefinitionsInFlowDefinition = <
  T extends string = FlowActionDefinitionId,
>(
  flowDefinition: Pick<FlowDefinition<T>, "steps">,
): StepDefinition<T>[] =>
  flowDefinition.steps.flatMap((step) =>
    step.kind === "for-each"
      ? [step, ...getAllStepDefinitionsInFlowDefinition(step)]
      : [step],
  );
