import { sleep } from "@local/hash-backend-utils/utils";
import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  RunFlowWorkflowParams,
  RunFlowWorkflowResponse,
} from "@local/hash-isomorphic-utils/flows/temporal-types";
import type {
  FlowDefinition,
  FlowStep,
  Payload,
  StepOutput,
} from "@local/hash-isomorphic-utils/flows/types";
import { validateFlowDefinition } from "@local/hash-isomorphic-utils/flows/util";
import type { EntityUuid } from "@local/hash-subgraph";
import type { Status } from "@local/status";
import { StatusCode } from "@local/status";
import {
  ActivityCancellationType,
  proxyActivities,
  workflowInfo,
} from "@temporalio/workflow";

import type { createFlowActivities } from "../activities/flow-activities";
import { stringify } from "../activities/shared/stringify";
import { getAllStepsInFlow } from "./run-flow-workflow/get-all-steps-in-flow";
import { getStepDefinitionFromFlowDefinition } from "./run-flow-workflow/get-step-definition-from-flow";
import {
  initializeActionStep,
  initializeFlow,
  initializeParallelGroup,
} from "./run-flow-workflow/initialize-flow";
import { passOutputsToUnprocessedSteps } from "./run-flow-workflow/pass-outputs-to-unprocessed-steps";
import { setQueryAndSignalHandlers } from "./run-flow-workflow/set-query-and-signal-handlers";

const log = (message: string) => {
  // eslint-disable-next-line no-console
  console.log(message);
};

const doesFlowStepHaveSatisfiedDependencies = (params: {
  step: FlowStep;
  flowDefinition: FlowDefinition;
  processedStepIds: string[];
}) => {
  const { step, flowDefinition, processedStepIds } = params;

  if (step.kind === "action") {
    /**
     * An action step has satisfied dependencies if all of its inputs have
     * been provided, based on the input sources defined in the step's
     * definition.
     *
     * We don't need to check if all required inputs have been provided,
     * as this will have been enforced when the flow was validated.
     */

    const { inputSources } = getStepDefinitionFromFlowDefinition({
      step,
      flowDefinition,
    });

    const actionDefinition = actionDefinitions[step.actionDefinitionId];

    return inputSources.every((inputSource) => {
      const inputDefinition = actionDefinition.inputs.find(
        ({ name }) => name === inputSource.inputName,
      );

      if (!inputDefinition) {
        throw new Error(
          `Definition for inputName '${inputSource.inputName}' in step ${step.stepId} not found in action definition ${step.actionDefinitionId}`,
        );
      }

      if (
        step.inputs?.some((input) => input.inputName === inputSource.inputName)
      ) {
        /**
         * If the input has been provided, the input has been satisfied.
         */
        return true;
      } else if (inputDefinition.required) {
        /**
         * If the input is required, and it hasn't been provided the step
         * has not satisfied its dependencies.
         */
        return false;
      } else if (
        inputSource.kind === "step-output" &&
        inputSource.sourceStepId !== "trigger"
      ) {
        /**
         * If the input is optional, but depends on a runnable step (i.e. not
         * the trigger), the step only has satisfied its dependencies if the
         * step it depends on has been processed.
         *
         * This ensures that the step is processed when all possible inputs
         * are provided in the flow.
         */
        return processedStepIds.includes(inputSource.sourceStepId);
      } else if (inputSource.kind === "parallel-group-input") {
        /**
         * If the input is optional, but has a parallel group input as it's source
         * the step should only be processed once this input has been provided.
         *
         * Otherwise the parallel group won't run, and produce any outputs.
         */
        return false;
      } else {
        /**
         * Otherwise, we consider the input satisfied because it is optional.
         */
        return true;
      }
    });
  } else {
    /**
     * A parallel group step has satisfied dependencies if the input it
     * parallelizes over has been provided.
     */

    const { inputToParallelizeOn } = step;

    return !!inputToParallelizeOn;
  }
};

const proxyFlowActivity = <
  ActionId extends keyof ReturnType<typeof createFlowActivities>,
>(params: {
  actionId: ActionId;
  maximumAttempts: number;
  activityId: string;
}): ReturnType<typeof createFlowActivities>[ActionId] => {
  const { actionId, maximumAttempts, activityId } = params;

  const { [actionId]: action } = proxyActivities<
    ReturnType<typeof createFlowActivities>
  >({
    cancellationType: ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
    /**
     * @todo H-2575 – decide what to do about timeouts, in light of potentially having to wait for user input
     *    – ideally we'd be able to wait on the workflow level, so that it's put to sleep until the response is
     *   received, but this requires refactoring the research task such that all tool calls are activities.
     * @see https://docs.temporal.io/dev-guide/typescript/features#asynchronous-design-patterns
     */
    startToCloseTimeout: "7200 second", // 2 hours
    retry: { maximumAttempts },
    activityId,
  });

  return action;
};

export const runFlowWorkflow = async (
  params: RunFlowWorkflowParams,
): Promise<RunFlowWorkflowResponse> => {
  const { flowDefinition, flowTrigger, userAuthentication, webId } = params;

  try {
    validateFlowDefinition(flowDefinition);
  } catch (error) {
    throw new Error((error as Error).message, {
      cause: {
        code: StatusCode.InvalidArgument,
        message: (error as Error).message,
        contents: [],
      },
    });
  }

  const userHasPermissionActivity = proxyFlowActivity({
    actionId: "userHasPermissionToRunFlowInWebActivity",
    maximumAttempts: 1,
    activityId: "check-permissions",
  });

  const persistFlowActivity = proxyFlowActivity({
    actionId: "persistFlowActivity",
    maximumAttempts: 1,
    activityId: "persist-flow",
  });

  // Ensure the user has permission to create entities in specified web
  const userHasPermissionToRunFlowInWeb = await userHasPermissionActivity();

  if (userHasPermissionToRunFlowInWeb.status !== "ok") {
    const errorMessage = `User does not have permission to run flow in web ${webId}, because they are missing permissions: ${userHasPermissionToRunFlowInWeb.missingPermissions.join(`,`)}`;
    throw new Error(errorMessage, {
      cause: {
        code: StatusCode.PermissionDenied,
        message: errorMessage,
        contents: [],
      },
    });
  }

  log(`Initializing ${flowDefinition.name} Flow`);

  const { workflowId } = workflowInfo();

  const flow = initializeFlow({
    flowDefinition,
    flowTrigger,
    flowRunId: workflowId as EntityUuid,
  });

  await persistFlowActivity({ flow, userAuthentication });

  setQueryAndSignalHandlers();

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

      const actionActivity = proxyFlowActivity({
        actionId: `${currentStep.actionDefinitionId}Action`,
        maximumAttempts: actionStepDefinition.retryCount ?? 1,
        activityId: currentStep.stepId,
      });

      log(
        `Step ${currentStepId}: executing "${
          currentStep.actionDefinitionId
        }" action with ${(currentStep.inputs ?? []).length} inputs`,
      );

      let actionResponse: Status<{
        outputs: StepOutput[];
      }>;

      try {
        actionResponse = await actionActivity({
          inputs: currentStep.inputs ?? [],
        });
      } catch (error) {
        log(
          `Step ${currentStepId}: encountered runtime error executing "${currentStep.actionDefinitionId}" action: ${stringify(error)}`,
        );

        actionResponse = {
          contents: [],
          code: StatusCode.Internal,
          message: `Error executing action ${currentStep.actionDefinitionId}: ${stringify(error)}`,
        };

        processStepErrors[currentStepId] = actionResponse;
      }

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

  const stepWithSatisfiedDependencies = getAllStepsInFlow(flow).filter((step) =>
    doesFlowStepHaveSatisfiedDependencies({
      step,
      flowDefinition,
      processedStepIds,
    }),
  );

  if (stepWithSatisfiedDependencies.length === 0) {
    const errorMessage =
      "No steps have satisfied dependencies when initializing the flow.";
    throw new Error(errorMessage, {
      cause: {
        code: StatusCode.FailedPrecondition,
        message: errorMessage,
        contents: [{ flow }],
      },
    });
  }

  // Recursively process steps which have satisfied dependencies
  const processSteps = async () => {
    const stepsToProcess = getAllStepsInFlow(flow).filter(
      (step) =>
        doesFlowStepHaveSatisfiedDependencies({
          step,
          flowDefinition,
          processedStepIds,
        }) &&
        !processedStepIds.some(
          (processedStepId) => processedStepId === step.stepId,
        ),
    );

    // There are no more steps which can be processed, so we exit the recursive loop
    if (stepsToProcess.length === 0) {
      return;
    }

    await Promise.all(stepsToProcess.map((step) => processStep(step.stepId)));

    await persistFlowActivity({ flow, userAuthentication });

    // Recursively call processSteps until all steps are processed
    await processSteps();
  };

  await processSteps();

  log("All processable steps have completed processing");

  /**
   * Wait to flush logs
   * @todo flush logs by calling the debounced function's flush, flushLogs – need to deal with it importing code that
   *   the workflow can't
   */
  await sleep(3_000);

  const stepErrors = Object.entries(processStepErrors).map(
    ([stepId, status]) => ({ ...status, contents: [{ stepId }] }),
  );

  /** @todo this is not necessarily an error once there are branches */
  if (processedStepIds.length !== getAllStepsInFlow(flow).length) {
    const errorMessage = "Not all steps in the flows were processed.";
    throw new Error(errorMessage, {
      cause: {
        code: StatusCode.Unknown,
        message: errorMessage,
        contents: [{ flow, stepErrors }],
      },
    });
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

      const errorMessage = `${errorPrefix}required step with id '${outputDefinition.stepId}' not found in outputs.`;
      throw new Error(errorMessage, {
        cause: {
          code: StatusCode.NotFound,
          message: errorMessage,
          contents: [{ flow, stepErrors }],
        },
      });
    }

    if (step.kind === "action") {
      const output = step.outputs?.find(
        ({ outputName }) => outputName === outputDefinition.stepOutputName,
      );

      if (!output) {
        if (!outputDefinition.required) {
          continue;
        }

        const errorMessage = `${errorPrefix}there is no output with name '${outputDefinition.stepOutputName}' in step ${step.stepId}`;

        throw new Error(errorMessage, {
          cause: {
            code: StatusCode.NotFound,
            message: errorMessage,
            contents: [{ stepErrors }],
          },
        });
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
        const errorMessage = `${errorPrefix}no aggregate output found in step ${step.stepId}`;
        throw new Error(errorMessage, {
          cause: {
            code: StatusCode.NotFound,
            message: errorMessage,
            contents: [{ stepErrors }],
          },
        });
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

  await persistFlowActivity({ flow, userAuthentication });

  const outputs = flow.outputs ?? [];

  return {
    /**
     * Steps may error and be retried, or the whole workflow retried, while still producing the required outputs
     * – start with an initial status of OK if the outputs are present, to be adjusted if necessary.
     */
    code: outputs.length ? StatusCode.Ok : StatusCode.Internal,
    contents: [{ outputs, stepErrors }],
  };
};
