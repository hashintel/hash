import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";

import { getAllStepsInFlow } from "./get-all-steps-in-flow.js";

import type { EntityUuid } from "@blockprotocol/type-system";
import type {
  ActionStep,
  ActionStepDefinition,
  ArrayPayload,
  FlowDefinition,
  FlowInputValues,
  FlowStep,
  ForEachStep,
  ForEachStepDefinition,
  LocalFlowRun,
  Payload,
  StepInputSource,
} from "@local/hash-isomorphic-utils/flows/types";

/**
 * Wraps a singular payload into a one-item array, for a connection marked `wrap`.
 */
export const wrapPayload = (payload: Payload): ArrayPayload =>
  ({ kind: payload.kind, value: [payload.value] }) as ArrayPayload;

/**
 * The payload a step input source provides when a step is initialized, if it is available yet.
 *
 * Step outputs are only available here if the producing step has already run (e.g. for the steps of a
 * for-each branch, created once the array is available). Otherwise `passOutputsToUnprocessedSteps` provides
 * them when the producing step completes.
 */
const getInitialSourcePayload = ({
  source,
  flowInputs,
  existingFlow,
  item,
}: {
  source: StepInputSource;
  flowInputs: FlowInputValues;
  existingFlow?: LocalFlowRun;
  item?: Payload;
}): Payload | undefined => {
  switch (source.kind) {
    case "flow-input":
      return flowInputs[source.inputName];

    case "step-output": {
      if (!existingFlow) {
        return undefined;
      }

      const sourceStep = getAllStepsInFlow(existingFlow).find(
        ({ stepId }) => stepId === source.stepId,
      );

      const sourceStepOutputs =
        sourceStep?.kind === "action"
          ? (sourceStep.outputs ?? [])
          : sourceStep?.collected
            ? [sourceStep.collected]
            : [];

      return sourceStepOutputs.find(
        ({ outputName }) => outputName === source.outputName,
      )?.payload;
    }

    case "item":
      if (!item) {
        throw new Error(
          "Expected the item of a for-each step when initializing a step that uses it",
        );
      }

      return item;

    case "constant":
      return source.payload as Payload;
  }
};

export const initializeActionStep = (params: {
  flowInputs: FlowInputValues;
  stepDefinition: ActionStepDefinition;
  overrideStepId?: string;
  existingFlow?: LocalFlowRun;
  /** The item of the for-each step branch this step is in, if any. */
  item?: Payload;
}): ActionStep => {
  const { overrideStepId, stepDefinition, flowInputs, existingFlow, item } =
    params;

  const actionDefinition = actionDefinitions[stepDefinition.actionDefinitionId];

  return {
    stepId: overrideStepId ?? stepDefinition.stepId,
    kind: "action",
    actionDefinitionId: stepDefinition.actionDefinitionId,
    inputs: [
      ...Object.entries(stepDefinition.inputs).flatMap(
        ([inputName, source]) => {
          const payload = getInitialSourcePayload({
            source,
            flowInputs,
            existingFlow,
            item,
          });

          if (!payload) {
            return [];
          }

          return {
            inputName,
            payload:
              source.kind !== "constant" && source.wrap
                ? wrapPayload(payload)
                : payload,
          };
        },
      ),
      /**
       * For inputs that aren't connected, use the default value specified in the action definition if it
       * exists.
       */
      ...actionDefinition.inputs
        .filter(({ name }) => !(name in stepDefinition.inputs))
        .flatMap((unconnectedInput) =>
          unconnectedInput.default
            ? {
                inputName: unconnectedInput.name,
                payload: unconnectedInput.default,
              }
            : [],
        ),
    ],
    outputs: [],
  };
};

export const initializeForEachStep = (params: {
  flowInputs: FlowInputValues;
  stepDefinition: ForEachStepDefinition;
  overrideStepId?: string;
  existingFlow?: LocalFlowRun;
  /** The item of the enclosing for-each step's branch, if this step is nested in one. */
  item?: Payload;
}): ForEachStep => {
  const { stepDefinition, overrideStepId, flowInputs, existingFlow, item } =
    params;

  const over = getInitialSourcePayload({
    source: stepDefinition.over,
    flowInputs,
    existingFlow,
    item,
  });

  return {
    stepId: overrideStepId ?? stepDefinition.stepId,
    kind: "for-each",
    over: over ? (over as ArrayPayload) : undefined,
    /** @todo: consider initializing the child steps here? */
  } satisfies ForEachStep;
};

export const initializeFlow = (params: {
  flowDefinition: FlowDefinition;
  flowDefinitionId: EntityUuid;
  flowInputs: FlowInputValues;
  name: string;
  temporalWorkflowId: string;
}): LocalFlowRun => {
  const {
    flowDefinition,
    flowDefinitionId,
    flowInputs,
    name,
    temporalWorkflowId,
  } = params;

  return {
    name,
    temporalWorkflowId,
    flowInputs,
    flowDefinitionId,
    steps: flowDefinition.steps.map<FlowStep>((stepDefinition) =>
      stepDefinition.kind === "action"
        ? initializeActionStep({ flowInputs, stepDefinition })
        : initializeForEachStep({ flowInputs, stepDefinition }),
    ),
  };
};
