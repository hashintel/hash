import type { EntityUuid } from "@local/hash-graph-types/entity";
import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  ActionStep,
  ActionStepDefinition,
  ArrayPayload,
  FlowDefinition,
  FlowStep,
  FlowTrigger,
  LocalFlowRun,
  ParallelGroupStep,
  ParallelGroupStepDefinition,
  Payload,
  StepInput,
} from "@local/hash-isomorphic-utils/flows/types";

import { getAllStepsInFlow } from "./get-all-steps-in-flow.js";

export const initializeActionStep = (params: {
  flowTrigger: FlowTrigger;
  stepDefinition:
    | ActionStepDefinition
    | ActionStepDefinition<{
        inputName: string;
        kind: "parallel-group-input";
      }>;
  overrideStepId?: string;
  existingFlow?: LocalFlowRun;
  parallelGroupInputPayload?: Payload;
}): ActionStep => {
  const {
    overrideStepId,
    stepDefinition,
    flowTrigger,
    existingFlow,
    parallelGroupInputPayload,
  } = params;

  const actionDefinition = actionDefinitions[stepDefinition.actionDefinitionId];

  return {
    stepId: overrideStepId ?? stepDefinition.stepId,
    kind: "action",
    actionDefinitionId: stepDefinition.actionDefinitionId,
    inputs: [
      ...stepDefinition.inputSources.flatMap((inputSource) => {
        if (inputSource.kind === "step-output") {
          if (inputSource.sourceStepId === "trigger") {
            const matchingTriggerOutput = flowTrigger.outputs?.find(
              ({ outputName }) =>
                outputName === inputSource.sourceStepOutputName,
            );

            if (matchingTriggerOutput) {
              return {
                inputName: inputSource.inputName,
                payload: matchingTriggerOutput.payload,
              };
            }
          } else if (existingFlow) {
            /**
             * If the input source refers to a step output, pass
             * the referred to output from the step as an input to
             * the new step.
             */
            const sourceStep = getAllStepsInFlow(existingFlow).find(
              (step) => step.stepId === inputSource.sourceStepId,
            );

            const sourceStepOutputs =
              sourceStep?.kind === "action"
                ? (sourceStep.outputs ?? [])
                : sourceStep?.aggregateOutput
                  ? [sourceStep.aggregateOutput]
                  : [];

            const matchingSourceStepOutput = sourceStepOutputs.find(
              ({ outputName }) =>
                outputName === inputSource.sourceStepOutputName,
            );

            if (matchingSourceStepOutput) {
              return {
                inputName: inputSource.inputName,
                payload: matchingSourceStepOutput.payload,
              };
            }
          }
        } else if (inputSource.kind === "parallel-group-input") {
          if (!parallelGroupInputPayload) {
            throw new Error(
              `Expected a parallel group input payload when initializing step with step definition id ${stepDefinition.stepId}`,
            );
          }

          return {
            inputName: inputSource.inputName,
            payload: parallelGroupInputPayload,
          };
        } else {
          return {
            inputName: inputSource.inputName,
            payload: inputSource.payload,
          };
        }

        return [];
      }),
      /**
       * For inputs without input sources, use the default value specified
       * in the action definition if it exists.
       */
      ...actionDefinition.inputs
        .filter(
          ({ name }) =>
            !stepDefinition.inputSources.some(
              ({ inputName }) => inputName === name,
            ),
        )
        .flatMap((inputWithoutInputSource) =>
          inputWithoutInputSource.default
            ? {
                inputName: inputWithoutInputSource.name,
                payload: inputWithoutInputSource.default,
              }
            : [],
        ),
    ],
    outputs: [],
  };
};

export const initializeParallelGroup = (params: {
  flowTrigger: FlowTrigger;
  stepDefinition: ParallelGroupStepDefinition;
}): ParallelGroupStep => {
  const { stepDefinition, flowTrigger } = params;

  let initialInputToParallelizeOn: StepInput<ArrayPayload> | undefined;

  if (
    stepDefinition.inputSourceToParallelizeOn.kind === "step-output" &&
    stepDefinition.inputSourceToParallelizeOn.sourceStepId === "trigger"
  ) {
    const { sourceStepOutputName } = stepDefinition.inputSourceToParallelizeOn;

    const matchingTriggerOutput = flowTrigger.outputs?.find(
      ({ outputName }) => outputName === sourceStepOutputName,
    );

    if (matchingTriggerOutput) {
      if (Array.isArray(matchingTriggerOutput.payload.value)) {
        initialInputToParallelizeOn = {
          inputName: stepDefinition.inputSourceToParallelizeOn.inputName,
          payload: matchingTriggerOutput.payload as ArrayPayload,
        };
      }
    }
  } else if (stepDefinition.inputSourceToParallelizeOn.kind === "hardcoded") {
    initialInputToParallelizeOn = {
      inputName: stepDefinition.inputSourceToParallelizeOn.inputName,
      payload: stepDefinition.inputSourceToParallelizeOn.payload,
    };
  }

  return {
    stepId: stepDefinition.stepId,
    kind: "parallel-group",
    inputToParallelizeOn: initialInputToParallelizeOn,
    /** @todo: consider initializing the child steps here? */
  } satisfies ParallelGroupStep;
};

export const initializeFlow = (params: {
  flowRunId: EntityUuid;
  flowDefinition: FlowDefinition;
  flowTrigger: FlowTrigger;
  name: string;
}): LocalFlowRun => {
  const { flowRunId, flowDefinition, flowTrigger, name } = params;

  return {
    name,
    flowRunId,
    trigger: {
      triggerDefinitionId: flowTrigger.triggerDefinitionId,
      outputs: flowTrigger.outputs,
    },
    flowDefinitionId: flowDefinition.flowDefinitionId,
    steps: flowDefinition.steps.map<FlowStep>((stepDefinition) => {
      if (stepDefinition.kind === "action") {
        return initializeActionStep({ flowTrigger, stepDefinition });
      } else {
        return initializeParallelGroup({ flowTrigger, stepDefinition });
      }
    }),
  };
};
