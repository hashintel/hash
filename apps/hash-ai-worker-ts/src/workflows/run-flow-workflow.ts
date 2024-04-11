import {
  type ActionDefinitionId,
  actionDefinitions,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  RunFlowWorkflowParams,
  RunFlowWorkflowResponse,
} from "@local/hash-isomorphic-utils/flows/temporal-types";
import type {
  FlowStep,
  Payload,
} from "@local/hash-isomorphic-utils/flows/types";
import { validateFlowDefinition } from "@local/hash-isomorphic-utils/flows/util";
import type { EntityUuid } from "@local/hash-subgraph/.";
import type { Status } from "@local/status";
import { StatusCode } from "@local/status";
import {
  ActivityCancellationType,
  proxyActivities,
  workflowInfo,
} from "@temporalio/workflow";

import type {
  createFlowActionActivities,
  createFlowActivities,
} from "../activities/flow-activities";
import { getAllStepsInFlow } from "./run-flow-workflow/get-all-steps-in-flow";
import { getStepDefinitionFromFlowDefinition } from "./run-flow-workflow/get-step-definition-from-flow";
import {
  initializeActionStep,
  initializeFlow,
  initializeParallelGroup,
} from "./run-flow-workflow/initialize-flow";
import { passOutputsToUnprocessedSteps } from "./run-flow-workflow/pass-outputs-to-unprocessed-steps";

const log = (message: string) => {
  // eslint-disable-next-line no-console
  console.log(message);
};

const doesFlowStepHaveSatisfiedDependencies = (step: FlowStep) => {
  if (step.kind === "action") {
    /**
     * An action step has satisfied dependencies if all of its required inputs
     * have been provided.
     */
    const requiredInputs = actionDefinitions[
      step.actionDefinitionId
    ].inputs.filter((input) => input.required);

    return requiredInputs.every((requiredInput) =>
      step.inputs?.some(({ inputName }) => requiredInput.name === inputName),
    );
  } else {
    /**
     * A parallel group step has satisfied dependencies if the input it
     * parallelizes over has been provided.
     */

    const { inputToParallelizeOn } = step;

    return !!inputToParallelizeOn;
  }
};

const flowActivities = proxyActivities<ReturnType<typeof createFlowActivities>>(
  {
    cancellationType: ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
    startToCloseTimeout: "3600 second", // 1 hour
    retry: { maximumAttempts: 1 },
  },
);

const proxyActionActivity = (params: {
  actionDefinitionId: ActionDefinitionId;
  maximumAttempts: number;
  activityId: string;
}) => {
  const { actionDefinitionId, maximumAttempts, activityId } = params;

  const { [`${actionDefinitionId}Action` as const]: action } = proxyActivities<
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
  const { flowDefinition, flowTrigger, userAuthentication } = params;

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

  const flow = initializeFlow({
    flowDefinition,
    flowTrigger,
    flowId: workflowId as EntityUuid,
  });

  await flowActivities.persistFlowActivity({ flow, userAuthentication });

  const processedStepIds: string[] = [];
  const processStepErrors: Record<string, Omit<Status<never>, "contents">> = {};

  // Function to process a single step
  const processStep = async (currentStepId: string) => {
    log(`Step ${currentStepId}: processing step`);

    const currentStep = getAllStepsInFlow(flow).find(
      (step) => step.stepId === currentStepId,
    );

    if (!currentStep) {
      processStepErrors[currentStepId] = {
        code: StatusCode.NotFound,
        message: `No step found with id ${currentStepId}`,
      };

      return;
    }

    if (currentStep.kind === "action") {
      const actionStepDefinition = getStepDefinitionFromFlowDefinition({
        step: currentStep,
        flowDefinition,
      });

      const actionActivity = proxyActionActivity({
        actionDefinitionId: currentStep.actionDefinitionId,
        maximumAttempts: actionStepDefinition.retryCount ?? 1,
        activityId: currentStep.stepId,
      });

      log(
        `Step ${currentStepId}: executing "${
          currentStep.actionDefinitionId
        }" action with ${(currentStep.inputs ?? []).length} inputs`,
      );

      const actionResponse = await actionActivity({
        inputs: currentStep.inputs ?? [],
        userAuthentication,
      });

      /**
       * Consider the step processed, even if the action failed to prevent
       * an infinite loop of retries.
       */
      processedStepIds.push(currentStep.stepId);

      if (actionResponse.code !== StatusCode.Ok) {
        log(
          `Step ${currentStepId}: error executing "${currentStep.actionDefinitionId}" action`,
        );

        processStepErrors[currentStepId] = {
          code: StatusCode.Internal,
          message: `Action ${currentStep.actionDefinitionId} failed with status code ${actionResponse.code}: ${actionResponse.message}`,
        };

        return;
      }

      const { outputs } = actionResponse.contents[0]!;

      log(
        `Step ${currentStepId}: obtained ${outputs.length} outputs from "${currentStep.actionDefinitionId}" action`,
      );

      currentStep.outputs = outputs;

      const status = passOutputsToUnprocessedSteps({
        flow,
        flowDefinition,
        outputs,
        processedStepIds,
        stepId: currentStepId,
        outputDefinitions:
          actionDefinitions[currentStep.actionDefinitionId].outputs,
      });

      if (status.code !== StatusCode.Ok) {
        processStepErrors[currentStepId] = {
          code: status.code,
          message: status.message,
        };

        // eslint-disable-next-line no-useless-return
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    } else if (currentStep.kind === "parallel-group") {
      const parallelGroupStepDefinition = getStepDefinitionFromFlowDefinition({
        step: currentStep,
        flowDefinition,
      });

      const { inputToParallelizeOn } = currentStep;

      if (!inputToParallelizeOn) {
        processStepErrors[currentStepId] = {
          code: StatusCode.Internal,
          message: `No input provided to parallelize on for step ${currentStepId}`,
        };

        return;
      }

      const { steps: parallelGroupStepDefinitions } =
        parallelGroupStepDefinition;

      const arrayToParallelizeOn = inputToParallelizeOn.payload.value;

      const newSteps = arrayToParallelizeOn.flatMap(
        (parallelizedValue, index) =>
          parallelGroupStepDefinitions.map((stepDefinition) => {
            if (stepDefinition.kind === "action") {
              const parallelGroupInputPayload: Payload = {
                kind: inputToParallelizeOn.payload.kind,
                value: parallelizedValue,
                /** @todo: figure out why this isn't assignable */
              } as Payload;

              return initializeActionStep({
                flowTrigger,
                stepDefinition,
                overrideStepId: `${stepDefinition.stepId}~${index}`,
                parallelGroupInputPayload,
              });
            } else {
              return initializeParallelGroup({ flowTrigger, stepDefinition });
            }
          }),
      );

      /**
       * Add the new steps to the child steps of the parallel group step.
       */
      currentStep.steps = [...(currentStep.steps ?? []), ...newSteps];

      /**
       * We consider the parallel group step "processed", even though its child
       * steps may not have finished executing, so that the step is not re-evaluated
       * in a subsequent iteration of `processSteps`.
       */
      processedStepIds.push(currentStep.stepId);
    }
  };

  const stepWithSatisfiedDependencies = getAllStepsInFlow(flow).filter(
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
    const stepsToProcess = getAllStepsInFlow(flow).filter(
      (step) =>
        doesFlowStepHaveSatisfiedDependencies(step) &&
        !processedStepIds.some(
          (processedStepId) => processedStepId === step.stepId,
        ),
    );

    // There are no more steps which can be processed, so we exit the recursive loop
    if (stepsToProcess.length === 0) {
      return;
    }

    await Promise.all(stepsToProcess.map((step) => processStep(step.stepId)));

    await flowActivities.persistFlowActivity({ flow, userAuthentication });

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

  if (processedStepIds.length !== getAllStepsInFlow(flow).length) {
    return {
      code: StatusCode.Unknown,
      message: "Not all steps in the flows were processed.",
      contents: [{ flow }],
    };
  }

  for (const outputDefinition of flowDefinition.outputs) {
    const step = getAllStepsInFlow(flow).find(
      (flowStep) => flowStep.stepId === outputDefinition.stepId,
    );

    const errorPrefix = `Error processing output definition '${outputDefinition.name}', `;

    if (!step) {
      if (!outputDefinition.required) {
        continue;
      }

      return {
        code: StatusCode.NotFound,
        message: `${errorPrefix}required step with id '${outputDefinition.stepId}' not found in outputs.`,
        contents: [{ flow }],
      };
    }

    if (step.kind === "action") {
      const output = step.outputs?.find(
        ({ outputName }) => outputName === outputDefinition.stepOutputName,
      );

      if (!output) {
        if (!outputDefinition.required) {
          continue;
        }

        return {
          code: StatusCode.NotFound,
          message: `${errorPrefix}there is no output with name '${outputDefinition.stepOutputName}' in step ${step.stepId}`,
          contents: [],
        };
      }

      flow.outputs = [
        ...(flow.outputs ?? []),
        {
          outputName: outputDefinition.name,
          payload: output.payload,
        },
      ];
    } else {
      const output = step.aggregateOutput;

      if (!output) {
        return {
          code: StatusCode.NotFound,
          message: `${errorPrefix}no aggregate output found in step ${step.stepId}`,
          contents: [],
        };
      }

      flow.outputs = [
        ...(flow.outputs ?? []),
        {
          outputName: outputDefinition.name,
          payload: output.payload,
        },
      ];
    }
  }

  await flowActivities.persistFlowActivity({ flow, userAuthentication });

  const flowOutputs = flow.outputs ?? [];

  return {
    code: StatusCode.Ok,
    contents: [{ flowOutputs }],
  };
};
