import type {
  ActionStepDefinition,
  FlowDefinition,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";

export const actionStep = (
  stepId: string,
  options: Partial<ActionStepDefinition<string>> = {},
): ActionStepDefinition<string> => ({
  kind: "action",
  stepId,
  actionDefinitionId: "queryEntities",
  description: "",
  inputs: {},
  ...options,
});

export const flowWith = (
  steps: StepDefinition<string>[],
): FlowDefinition<string> => ({
  name: "Flow",
  description: "",
  inputs: [],
  steps,
  outputs: [],
});
