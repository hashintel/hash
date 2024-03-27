import type {
  ActionStep,
  ActionStepDefinition,
  ArrayPayload,
  Flow,
  FlowDefinition,
  FlowStep,
  FlowTrigger,
  ParallelGroupStep,
  StepInput,
} from "@local/hash-isomorphic-utils/flows/types";

const initializeActionStep = (params: {
  flowTrigger: FlowTrigger;
  stepDefinition: ActionStepDefinition;
}): ActionStep => {
  const { stepDefinition, flowTrigger } = params;

  return {
    stepId: stepDefinition.stepId,
    kind: "action",
    actionDefinition: stepDefinition.actionDefinition,
    inputs: stepDefinition.inputSources.flatMap((inputSource) => {
      if (inputSource.kind === "step-output") {
        if (inputSource.sourceStepId === "trigger") {
          const matchingTriggerOutput = flowTrigger.outputs?.find(
            ({ outputName }) => outputName === inputSource.sourceStepOutputName,
          );

          if (matchingTriggerOutput) {
            return {
              inputName: inputSource.inputName,
              payload: matchingTriggerOutput.payload,
            };
          }
        }
        /**
         * @todo: consider whether some nodes may have outputs before
         * nodes have been processed
         */
      } else {
        return {
          inputName: inputSource.inputName,
          payload: inputSource.value,
        };
      }

      return [];
    }),
    outputs: [],
  };
};

export const initializeFlow = (params: {
  flowId: string;
  flowDefinition: FlowDefinition;
  flowTrigger: FlowTrigger;
}): Flow => {
  const { flowId, flowDefinition, flowTrigger } = params;

  return {
    flowId,
    trigger: {
      definition: flowTrigger.definition,
      outputs: flowTrigger.outputs,
    },
    definition: flowDefinition,
    steps: flowDefinition.steps.map<FlowStep>((stepDefinition) => {
      if (stepDefinition.kind === "action") {
        return initializeActionStep({ flowTrigger, stepDefinition });
      } else {
        let initialInputToParallelizeOn: StepInput<ArrayPayload> | undefined;

        if (
          stepDefinition.inputSourceToParallelizeOn.kind === "step-output" &&
          stepDefinition.inputSourceToParallelizeOn.sourceStepId === "trigger"
        ) {
          const { sourceStepOutputName } =
            stepDefinition.inputSourceToParallelizeOn;

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
        } else if (
          stepDefinition.inputSourceToParallelizeOn.kind === "hardcoded"
        ) {
          initialInputToParallelizeOn = {
            inputName: stepDefinition.inputSourceToParallelizeOn.inputName,
            payload: stepDefinition.inputSourceToParallelizeOn.value,
          };
        }

        return {
          stepId: stepDefinition.stepId,
          kind: "parallel-group",
          inputToParallelizeOn: initialInputToParallelizeOn,
          /** @todo: consider initializing the child steps here? */
        } satisfies ParallelGroupStep;
      }
    }),
  };
};
