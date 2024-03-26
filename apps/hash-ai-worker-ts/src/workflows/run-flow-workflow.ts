import {
  actionDefinitions,
  type ActionId,
} from "@local/hash-isomorphic-utils/flows/step-definitions";
import type {
  RunFlowWorkflowParams,
  RunFlowWorkflowResponse,
} from "@local/hash-isomorphic-utils/flows/temporal-types";
import type {
  Flow,
  Payload,
  Step,
  StepInputSource,
} from "@local/hash-isomorphic-utils/flows/types";
import { validateFlowDefinition } from "@local/hash-isomorphic-utils/flows/util";
import type { Status } from "@local/status";
import { StatusCode } from "@local/status";
import {
  ActivityCancellationType,
  proxyActivities,
  workflowInfo,
} from "@temporalio/workflow";

import type { createFlowActionActivities } from "../activities/flow-action-activites";

const log = (message: string) => {
  // eslint-disable-next-line no-console
  console.log(message);
};

const doesFlowStepHaveSatisfiedDependencies = (step: Step) => {
  const requiredInputs = step.definition.inputs.filter(
    (input) => input.required,
  );

  return requiredInputs.every((requiredInput) =>
    step.inputs?.some(({ inputName }) => requiredInput.name === inputName),
  );
};

const proxyActionActivity = (params: {
  actionId: ActionId;
  maximumAttempts: number;
  activityId: string;
}) => {
  const { actionId, maximumAttempts, activityId } = params;

  const { [`${actionId}Action` as const]: action } = proxyActivities<
    ReturnType<typeof createFlowActionActivities>
  >({
    cancellationType: ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
    startToCloseTimeout: "3600 second", // 1 hour
    retry: { maximumAttempts },
    activityId,
  });

  return action;
};

export const runFlowWorkflow = async (
  params: RunFlowWorkflowParams,
): Promise<RunFlowWorkflowResponse> => {
  const { flowDefinition, trigger, userAuthentication } = params;

  try {
    validateFlowDefinition(flowDefinition);
  } catch (error) {
    return {
      code: StatusCode.InvalidArgument,
      message: (error as Error).message,
      contents: [],
    };
  }

  log(`Initializing ${flowDefinition.name} Flow`);

  const { workflowId } = workflowInfo();

  const flow: Flow = {
    flowId: workflowId,
    trigger: {
      definition: trigger.definition,
      outputs: trigger.outputs,
    },
    definition: flowDefinition,
    steps: flowDefinition.nodes.map<Step>((node) => ({
      stepId: `${node.nodeId}`,
      definition: node.definition,
      inputs: node.inputSources
        .map((inputSource) => {
          if (inputSource.kind === "step-output") {
            if (inputSource.sourceNodeId === "trigger") {
              const matchingTriggerOutput = trigger.outputs?.find(
                ({ outputName }) =>
                  outputName === inputSource.sourceNodeOutputName,
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
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          } else if (inputSource.kind === "hardcoded") {
            return {
              inputName: inputSource.inputName,
              payload: inputSource.value,
            };
          }

          return [];
        })
        .flat(),
      outputs: [],
    })),
  };

  const processedSteps: Step[] = [];
  const processStepErrors: Record<string, Omit<Status<never>, "contents">> = {};

  /**
   * @todo: consider a more ergonomic way from mapping a step to its
   * corresponding flow definition node
   */
  const getStepFlowDefinitionNode = (step: Step) => {
    const flowDefinitionNode = flow.definition.nodes.find(
      (node) => node.nodeId === step.stepId.split("~")[0],
    );

    if (!flowDefinitionNode) {
      throw new Error(
        `No flow definition node found for step with id ${step.stepId}`,
      );
    }

    return flowDefinitionNode;
  };

  // Function to process a single step
  const processStep = async (currentStepId: string) => {
    log(`Step ${currentStepId}: processing step`);

    const currentStep = flow.steps.find(
      (step) => step.stepId === currentStepId,
    );

    if (!currentStep) {
      processStepErrors[currentStepId] = {
        code: StatusCode.NotFound,
        message: `No step found with id ${currentStepId}`,
      };

      return;
    }

    const { retryCount } = getStepFlowDefinitionNode(currentStep);

    const actionId = Object.entries(actionDefinitions).find(
      ([_actionName, definition]) =>
        definition.name === currentStep.definition.name,
    )?.[0];

    const actionActivity = proxyActionActivity({
      actionId: actionId as ActionId,
      maximumAttempts: retryCount ?? 1,
      activityId: currentStep.stepId,
    });

    log(
      `Step ${currentStepId}: executing "${currentStep.definition.name}" action with ${(currentStep.inputs ?? []).length} inputs`,
    );

    const actionResponse = await actionActivity({
      inputs: currentStep.inputs ?? [],
      userAuthentication,
    });

    if (actionResponse.code !== StatusCode.Ok) {
      log(
        `Step ${currentStepId}: error executing "${currentStep.definition.name}" action`,
      );

      processStepErrors[currentStepId] = {
        code: StatusCode.Internal,
        message: `Action ${currentStep.definition.name} failed with status code ${actionResponse.code}: ${actionResponse.message}`,
      };

      return;
    }

    const { outputs } = actionResponse.contents[0]!;

    log(
      `Step ${currentStepId}: obtained ${outputs.length} outputs from "${currentStep.definition.name}" action`,
    );

    currentStep.outputs = outputs;

    processedSteps.push(currentStep);

    const unprocessedSteps = flow.steps.filter(
      (step) =>
        !processedSteps.some(
          (processedStep) => processedStep.stepId === step.stepId,
        ),
    );

    for (const unprocessedStep of unprocessedSteps) {
      const { inputSources } = getStepFlowDefinitionNode(unprocessedStep);

      const matchingInputSources = inputSources.filter(
        (
          inputSource,
        ): inputSource is Extract<StepInputSource, { kind: "step-output" }> =>
          inputSource.kind === "step-output" &&
          inputSource.sourceNodeId === currentStep.stepId,
      );

      if (matchingInputSources.length > 1) {
        /**
         * @todo: figure out how to handle passing multiple outputs
         * as inputs to the unprocessed step, taking into consideration
         * if there is an array mismatch between the output and input.
         */
      } else if (matchingInputSources[0]) {
        const matchingInputSource = matchingInputSources[0];

        const matchingOutputDefinition = currentStep.definition.outputs.find(
          ({ name }) => name === matchingInputSource.sourceNodeOutputName,
        )!;

        const matchingOutput = outputs.find(
          ({ outputName }) =>
            outputName === matchingInputSource.sourceNodeOutputName,
        )!;

        const matchingInputDefinition = unprocessedStep.definition.inputs.find(
          ({ name }) => matchingInputSource.inputName === name,
        )!;

        if (matchingOutputDefinition.array === matchingInputDefinition.array) {
          /**
           * If the output and input are both arrays, or both not arrays, we
           * can directly pass the output value as the input value for the
           * unprocessed step.
           */

          unprocessedStep.inputs = [
            ...(unprocessedStep.inputs ?? []),
            {
              inputName: matchingInputSource.inputName,
              payload: matchingOutput.payload,
            },
          ];
        } else if (
          matchingOutputDefinition.array &&
          !matchingInputDefinition.array
        ) {
          if (!Array.isArray(matchingOutput.payload.value)) {
            processStepErrors[currentStepId] = {
              code: StatusCode.Internal,
              message: `The output for step ${currentStep.stepId} is not an array, but its output definition defines it as an array.`,
            };
            return;
          }
          /**
           * If the output is an array, but the input is not an array, we need
           * to run the unprocessed step for each value in the output array.
           */

          // Remove the original unprocessed step as we will replace it with new steps
          flow.steps = flow.steps.filter(
            (step) => step.stepId !== unprocessedStep.stepId,
          );

          // Create a new step for each item in the output array
          const newSteps = matchingOutput.payload.value.map(
            (payloadValueItem, index): Step => {
              const newStepId = `${unprocessedStep.stepId}~${index}`;

              const payload: Payload = {
                kind: matchingOutput.payload.kind,
                value: payloadValueItem,
                /** @todo: figure out why this isn't assignable */
              } as Payload;

              return {
                ...unprocessedStep,
                stepId: newStepId,
                inputs: [
                  // Inputs that may have already been provided to previous version of the step
                  ...(unprocessedStep.inputs ?? []),
                  {
                    inputName: matchingInputSource.inputName,
                    payload,
                  },
                ],
              };
            },
          );

          flow.steps.push(...newSteps);
        } else if (
          !matchingOutputDefinition.array &&
          matchingInputDefinition.array
        ) {
          if (Array.isArray(matchingOutput.payload.value)) {
            processStepErrors[currentStepId] = {
              code: StatusCode.Internal,
              message: `The output for step ${currentStep.stepId} is an array, but its output definition defines it as a single value.`,
            };

            return;
          }
          /**
           * If the output is not an array, but the input is an array, we can
           * wrap the output value in an array to pass it as the input value.
           */

          const payload: Payload = {
            kind: matchingOutput.payload.kind,
            value: [matchingOutput.payload.value],
            /** @todo: figure out why this isn't assignable */
          } as Payload;

          unprocessedStep.inputs = [
            ...(unprocessedStep.inputs ?? []),
            {
              inputName: matchingInputSource.inputName,
              payload,
            },
          ];
        }
      }
    }
  };

  const stepWithSatisfiedDependencies = flow.steps.filter(
    doesFlowStepHaveSatisfiedDependencies,
  );

  if (stepWithSatisfiedDependencies.length === 0) {
    return {
      code: StatusCode.FailedPrecondition,
      message:
        "No steps have satisfied dependencies when initializing the flow.",
      contents: [{ flow }],
    };
  }

  // Recursively process steps which have satisfied dependencies
  const processSteps = async () => {
    const stepsToProcess = flow.steps.filter(
      (step) =>
        doesFlowStepHaveSatisfiedDependencies(step) &&
        !processedSteps.some(
          (processedStep) => processedStep.stepId === step.stepId,
        ),
    );

    // There are no more steps which can be processed, so we exit the recursive loop
    if (stepsToProcess.length === 0) {
      return;
    }

    await Promise.all(stepsToProcess.map((step) => processStep(step.stepId)));

    // Recursively call processSteps until all steps are processed
    await processSteps();
  };

  await processSteps();

  log("All processable steps have completed processing");

  if (Object.entries(processStepErrors).length > 0) {
    return {
      code: StatusCode.Internal,
      message:
        "One or more errors occurred while processing the steps in the flow.",
      contents: [
        {
          flow,
          stepErrors: Object.entries(processStepErrors).map(
            ([stepId, status]) => ({ ...status, contents: [{ stepId }] }),
          ),
        },
      ],
    };
  }

  if (processedSteps.length !== flow.steps.length) {
    return {
      code: StatusCode.Unknown,
      message: "Not all steps in the flows were processed.",
      contents: [{ flow }],
    };
  }

  return {
    code: StatusCode.Ok,
    contents: [{ flow }],
  };
};
