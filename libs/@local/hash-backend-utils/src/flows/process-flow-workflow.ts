import {
  ApplicationFailure,
  CancellationScope,
  isCancellation,
  proxyActivities,
  TemporalFailure,
  upsertMemo,
  workflowInfo,
} from "@temporalio/workflow";

import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { getFlowType } from "@local/hash-isomorphic-utils/flows/get-flow-type";
import { toStepErrors } from "@local/hash-isomorphic-utils/flows/run-events";
import {
  generateStepRunId,
  parseStepRunId,
} from "@local/hash-isomorphic-utils/flows/step-run-id";
import { getArrayPayloadItems } from "@local/hash-isomorphic-utils/flows/stored-payload-refs";
import { asPayload } from "@local/hash-isomorphic-utils/flows/types";
import { getAllStepDefinitionsInFlowDefinition } from "@local/hash-isomorphic-utils/flows/util";
import {
  omitInvalidEmptyFlowInputs,
  validateFlowInputs,
} from "@local/hash-isomorphic-utils/flows/validate-payloads";
import { stringifyError } from "@local/hash-isomorphic-utils/stringify-error";
import { StatusCode } from "@local/status";

import { sleep } from "../utils.js";
import { getActionActivityOptions } from "./action-activity-options.js";
import { getAllStepsInFlow } from "./process-flow-workflow/get-all-steps-in-flow.js";
import { getStepDefinitionFromFlowDefinition } from "./process-flow-workflow/get-step-definition-from-flow.js";
import {
  initializeActionStep,
  initializeFlow,
  initializeForEachStep,
} from "./process-flow-workflow/initialize-flow.js";
import {
  collectSkippedBranchStep,
  completeForEachStep,
  passOutputsToUnprocessedSteps,
} from "./process-flow-workflow/pass-outputs-to-unprocessed-steps.js";
import { toRunFailure } from "./process-flow-workflow/to-run-failure.js";

import type { ActionName, FlowActionActivity } from "./action-types.js";
import type { createCommonFlowActivities } from "./process-flow-workflow/common-activities.js";
import type { EntityId, Timestamp } from "@blockprotocol/type-system";
import type { FlowActionStepOutput } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  BaseRunFlowWorkflowParams,
  FlowRunEnding,
  RunFlowWorkflowResponse,
} from "@local/hash-isomorphic-utils/flows/temporal-types";
import type {
  FlowActionDefinitionId,
  FlowDefinition,
  FlowInputValues,
  FlowOutputDefinition,
  FlowStep,
  LocalFlowRun,
  Payload,
  StepInputSource,
  SkippedStep,
  StartedForEachStep,
  StepOutput,
} from "@local/hash-isomorphic-utils/flows/types";
import type { Status } from "@local/status";

const log = (message: string) => {
  // eslint-disable-next-line no-console
  console.log(message);
};

/**
 * Whether a step can run now, must wait for more of its inputs, or is skipped because a value it needs is
 * missing: either from a step that was itself skipped, or from a connection marked `whenMissing: "skip"`.
 */
type StepReadiness = "ready" | "waiting" | "skip";

/**
 * The run step that provides a source's output to a consumer: in a for-each branch, the producer in the same
 * branch if there is one, otherwise the producer outside the for-each step.
 */
const getProducerRunStepId = ({
  flow,
  consumerStepId,
  producerStepId,
}: {
  flow: LocalFlowRun;
  consumerStepId: string;
  producerStepId: string;
}) => {
  const { itemIndex } = parseStepRunId(consumerStepId);

  if (itemIndex !== undefined) {
    const producerInBranch = generateStepRunId(producerStepId, itemIndex);

    if (
      getAllStepsInFlow(flow).some(({ stepId }) => stepId === producerInBranch)
    ) {
      return producerInBranch;
    }
  }

  return producerStepId;
};

const getStepReadiness = (params: {
  step: FlowStep;
  flow: LocalFlowRun;
  flowDefinition: FlowDefinition;
  processedStepIds: string[];
  skippedStepIds: string[];
  /** Steps that ran and failed. */
  failedStepIds: string[];
}): StepReadiness => {
  const {
    step,
    flow,
    flowDefinition,
    processedStepIds,
    skippedStepIds,
    failedStepIds,
  } = params;

  /**
   * The readiness of one missing value, from the source that would provide it.
   */
  const getMissingValueReadiness = ({
    source,
    required,
  }: {
    source: StepInputSource;
    required: boolean;
  }): StepReadiness => {
    if (source.kind !== "step-output") {
      /*
       * Flow inputs, items and constants are provided when the step is initialized, so a missing one never
       * arrives: an optional flow input that wasn't given skips the step if the connection says to.
       */
      if (!required) {
        return "ready";
      }

      return source.kind !== "constant" && source.whenMissing === "skip"
        ? "skip"
        : "waiting";
    }

    const producerStepId = getProducerRunStepId({
      flow,
      consumerStepId: step.stepId,
      producerStepId: source.stepId,
    });

    if (skippedStepIds.includes(producerStepId)) {
      return required ? "skip" : "ready";
    }

    const producer = getAllStepsInFlow(flow).find(
      ({ stepId }) => stepId === producerStepId,
    );

    /*
     * A for-each step is processed once it starts its branches, but its collected output only exists once every
     * branch has finished.
     */
    const producerHasFinished =
      processedStepIds.includes(producerStepId) &&
      (producer?.kind !== "for-each" || producer.collected !== undefined);

    if (!producerHasFinished) {
      /* Wait for the producer to finish, even for an optional input, so that it's provided if produced. */
      return "waiting";
    }

    if (!required) {
      return "ready";
    }

    /*
     * The producer finished without producing the value. If it failed, or the connection doesn't skip this step when
     * the value is missing, the step never becomes ready, and the run fails.
     */
    return source.whenMissing === "skip" &&
      !failedStepIds.includes(producerStepId)
      ? "skip"
      : "waiting";
  };

  if (step.kind === "for-each") {
    if (step.over) {
      return "ready";
    }

    const { over } = getStepDefinitionFromFlowDefinition({
      step,
      flowDefinition,
    });

    return getMissingValueReadiness({ source: over, required: true });
  }

  const { inputs } = getStepDefinitionFromFlowDefinition({
    step,
    flowDefinition,
  });

  const actionDefinition = actionDefinitions[step.actionDefinitionId];

  const readinessOfInputs = Object.entries(inputs).map(
    ([inputName, source]): StepReadiness => {
      const inputDefinition = actionDefinition.inputs.find(
        ({ name }) => name === inputName,
      );

      if (!inputDefinition) {
        const errorMessage = `Definition for inputName '${inputName}' in step ${step.stepId} not found in action definition ${step.actionDefinitionId}`;

        throw ApplicationFailure.create({
          message: errorMessage,
          details: [
            {
              code: StatusCode.FailedPrecondition,
              message: errorMessage,
            },
          ],
        });
      }

      if (step.inputs?.some((input) => input.inputName === inputName)) {
        return "ready";
      }

      return getMissingValueReadiness({
        source,
        required: inputDefinition.required,
      });
    },
  );

  if (readinessOfInputs.includes("skip")) {
    return "skip";
  }

  return readinessOfInputs.every((readiness) => readiness === "ready")
    ? "ready"
    : "waiting";
};

/**
 * Whether a flow output is always produced: the output of an action that always produces it, or a for-each
 * step's collected output.
 */
/**
 * Whether a flow output must be present for the run to succeed: an output the action may not produce, or whose
 * step was skipped (because a value it needs was missing), is not.
 */
const isRequiredFlowOutput = (
  flowDefinition: FlowDefinition,
  outputDefinition: FlowOutputDefinition,
  skippedStepIds: string[],
) => {
  if (skippedStepIds.includes(outputDefinition.stepId)) {
    return false;
  }

  const stepDefinition = getAllStepDefinitionsInFlowDefinition(
    flowDefinition,
  ).find(({ stepId }) => stepId === outputDefinition.stepId);

  if (stepDefinition?.kind !== "action") {
    return true;
  }

  return (
    actionDefinitions[stepDefinition.actionDefinitionId].outputs.find(
      ({ name }) => name === outputDefinition.outputName,
    )?.required ?? true
  );
};

/* Reads, which are safe to try again. */
const { getFlowDefinitionActivity, userHasPermissionToRunFlowInWebActivity } =
  proxyActivities<ReturnType<typeof createCommonFlowActivities>>({
    startToCloseTimeout: "60 second",
    retry: {
      maximumAttempts: 3,
    },
  });

const { persistFlowActivity } = proxyActivities<
  ReturnType<typeof createCommonFlowActivities>
>({
  startToCloseTimeout: "60 second",
  retry: {
    maximumAttempts: 1,
  },
});

/**
 * The activity that runs an action, on the task queue and with the settings its definition gives
 * (`getActionActivityOptions`), whichever worker runs the flow.
 */
const proxyActionActivity = ({
  actionDefinitionId,
  maximumAttempts,
  activityId,
}: {
  actionDefinitionId: FlowActionDefinitionId;
  maximumAttempts: number;
  activityId: string;
}) => {
  const actionName =
    `${actionDefinitionId}Action` satisfies ActionName<FlowActionDefinitionId>;

  const { [actionName]: action } = proxyActivities<
    Record<ActionName<FlowActionDefinitionId>, FlowActionActivity>
  >({
    ...getActionActivityOptions(actionDefinitionId),
    retry: { maximumAttempts },
    activityId,
  });

  return action;
};

const { recordFlowRunActivity } = proxyActivities<
  ReturnType<typeof createCommonFlowActivities>
>({
  startToCloseTimeout: "5 minutes",
  retry: {
    maximumAttempts: 3,
  },
});

/**
 * Records how the run ended, as the last thing it does: even when the run is cancelled. A run that couldn't be
 * recorded is recorded the next time it's read.
 */
const recordFlowRun = async (
  params: Parameters<typeof recordFlowRunActivity>[0],
) => {
  try {
    await CancellationScope.nonCancellable(() => recordFlowRunActivity(params));
  } catch (error) {
    log(`Could not record how the run ended: ${stringifyError(error)}`);
  }
};

/**
 * How a run ends when it throws `runFailure`, or `null` if it doesn't end: Temporal retries the workflow task instead
 * when it throws anything but a `TemporalFailure`.
 */
const getFailedRunEnding = (runFailure: unknown): FlowRunEnding | null => {
  if (isCancellation(runFailure)) {
    return { kind: "cancelled" };
  }

  if (!(runFailure instanceof TemporalFailure)) {
    return null;
  }

  const [details] =
    runFailure instanceof ApplicationFailure
      ? ((runFailure.details as
          | Partial<RunFlowWorkflowResponse>[]
          | undefined) ?? [])
      : [];
  const stepErrors = details?.contents?.[0]?.stepErrors;

  return {
    kind: "failed",
    failure: {
      message: runFailure.message,
      ...(details?.code ? { code: details.code } : {}),
    },
    ...(stepErrors ? { stepErrors: toStepErrors(stepErrors) } : {}),
  };
};

const processFlow = async (
  params: BaseRunFlowWorkflowParams & {
    generateFlowRunName?: (params: {
      flowDefinition: FlowDefinition;
      flowDefinitionEntityId: EntityId;
      flowInputs: FlowInputValues;
    }) => Promise<string>;
  },
): Promise<RunFlowWorkflowResponse> => {
  const {
    flowDefinitionEntityId,
    flowRunEntityUuid,
    flowRunName,
    flowTriggerEntityId,
    userAuthentication,
    webId,
    generateFlowRunName,
  } = params;

  /*
   * The run executes the definition's edition current when it starts: at the start of its execution chain, which a
   * retry, replay or reset keeps. The frontend draws a run with the edition current then too.
   */
  const flowDefinitionResult = await getFlowDefinitionActivity({
    atTime: workflowInfo().startTime.toISOString() as Timestamp,
    flowDefinitionEntityId,
    userAuthentication,
  });

  if (flowDefinitionResult.status !== "ok") {
    throw ApplicationFailure.create({
      message: flowDefinitionResult.errorMessage,
      details: [
        {
          code:
            flowDefinitionResult.status === "not-found"
              ? StatusCode.NotFound
              : StatusCode.InvalidArgument,
          message: flowDefinitionResult.errorMessage,
          contents: [],
        },
      ],
    });
  }

  const { flowDefinition } = flowDefinitionResult;

  /*
   * Checked on every run, not only when it's requested, because a scheduled run starts later, and the definition or
   * the user's feature flags may have changed since.
   */
  const userHasPermissionToRunFlowInWeb =
    await userHasPermissionToRunFlowInWebActivity({
      requiresAiFeatureFlag: getFlowType(flowDefinition) === "ai",
      userAuthentication,
      webId,
    });

  if (userHasPermissionToRunFlowInWeb.status !== "ok") {
    const errorMessage = `User does not have permission to run flow in web ${webId}: ${userHasPermissionToRunFlowInWeb.errorMessage}`;
    throw ApplicationFailure.create({
      message: errorMessage,
      details: [
        {
          code: StatusCode.PermissionDenied,
          message: errorMessage,
          contents: [],
        },
      ],
    });
  }

  /* A form, or a schedule saved from one, may give an input left blank as an empty string. */
  const flowInputs = omitInvalidEmptyFlowInputs({
    inputDefinitions: flowDefinition.inputs,
    flowInputs: params.flowInputs,
  });

  const invalidFlowInputMessage = validateFlowInputs({
    inputDefinitions: flowDefinition.inputs,
    flowInputs,
  });

  if (invalidFlowInputMessage) {
    throw ApplicationFailure.create({
      message: invalidFlowInputMessage,
      nonRetryable: true,
      details: [
        {
          code: StatusCode.InvalidArgument,
          message: invalidFlowInputMessage,
          contents: [],
        },
      ],
    });
  }

  const initialFlowName = flowRunName ?? flowDefinition.name;
  log(`Initializing ${initialFlowName} Flow`);

  const { workflowId } = workflowInfo();

  const flow = initializeFlow({
    flowDefinition,
    flowDefinitionEntityId,
    flowInputs,
    temporalWorkflowId: workflowId,
    /**
     * Use flowRunName if provided (e.g. from a schedule), otherwise use the flow definition's name.
     * This may be overwritten by generateFlowRunName if provided.
     */
    name: initialFlowName,
  });

  await persistFlowActivity({
    flow,
    flowDefinitionEntityId: flowDefinitionResult.flowDefinitionEntityId,
    flowRunEntityUuid,
    flowTriggerEntityId,
    startedAt: workflowInfo().startTime.toISOString(),
    stepIds: ["initialize-flow"],
    userAuthentication,
    webId,
  });

  if (generateFlowRunName) {
    const generatedName = await generateFlowRunName({
      flowDefinition,
      flowDefinitionEntityId,
      flowInputs,
    });
    flow.name = generatedName;

    await persistFlowActivity({
      flow,
      stepIds: ["generate-flow-run-name"],
      userAuthentication,
      webId,
    });
  }

  const processedStepIds: string[] = [];
  /** Steps skipped because a value they need is missing (see `getStepReadiness`); also in `processedStepIds`. */
  const skippedStepIds: string[] = [];
  const skippedSteps: SkippedStep[] = [];
  const startedForEachSteps: StartedForEachStep[] = [];
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
        maximumAttempts: actionStepDefinition.retryCount ?? 3,
        activityId: currentStep.stepId,
      });

      log(
        `Step ${currentStepId}: executing "${
          currentStep.actionDefinitionId
        }" action with ${(currentStep.inputs ?? []).length} inputs`,
      );

      let actionResponse: Status<{
        outputs: FlowActionStepOutput<FlowActionDefinitionId>[];
      }>;

      try {
        actionResponse = await actionActivity({
          inputs: currentStep.inputs ?? [],
        });
      } catch (error) {
        log(
          `Step ${currentStepId}: encountered runtime error executing "${
            currentStep.actionDefinitionId
          }" action: ${stringifyError(error)}`,
        );

        actionResponse = {
          contents: [],
          code: StatusCode.Internal,
          message: `Error executing action ${
            currentStep.actionDefinitionId
          }: ${stringifyError(error)}`,
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

      /*
       * An output that takes its kind from an input is typed as any kind that input accepts, here, outside the action,
       * where TypeScript can no longer check that its kind and value match. It checked that in the action, which is
       * generic over the kind it is given (see `FlowActionActivity`).
       */
      const outputs: StepOutput[] = actionResponse.contents[0]!.outputs.map(
        ({ outputName, payload }) => ({
          outputName,
          payload: asPayload(payload),
        }),
      );

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
    } else if (currentStep.kind === "for-each") {
      const forEachStepDefinition = getStepDefinitionFromFlowDefinition({
        step: currentStep,
        flowDefinition,
      });

      const { over } = currentStep;

      if (!over) {
        processStepErrors[currentStepId] = {
          code: StatusCode.Internal,
          message: `No array to iterate over provided for step ${currentStepId}`,
        };

        return;
      }

      /**
       * The items to run the nested steps for. A stored array is iterated using its length alone, giving each
       * branch a reference to its item, which the activities it runs resolve.
       */
      const items = getArrayPayloadItems(over.value);

      const newSteps = items.flatMap((itemValue, index) => {
        const item = { kind: over.kind, value: itemValue } as Payload;

        return forEachStepDefinition.steps.map((stepDefinition) =>
          stepDefinition.kind === "action"
            ? initializeActionStep({
                flowInputs,
                stepDefinition,
                overrideStepId: generateStepRunId(stepDefinition.stepId, index),
                existingFlow: flow,
                item,
              })
            : initializeForEachStep({
                flowInputs,
                stepDefinition,
                overrideStepId: generateStepRunId(stepDefinition.stepId, index),
                existingFlow: flow,
                item,
              }),
        );
      });

      /**
       * Add the new steps to the child steps of the for-each step.
       */
      currentStep.steps = [...(currentStep.steps ?? []), ...newSteps];

      startedForEachSteps.push({
        stepId: currentStep.stepId,
        itemCount: items.length,
        startedAt: new Date().toISOString(),
      });
      upsertMemo({ startedForEachSteps });

      /**
       * We consider the for-each step "processed", even though its child steps may not have finished executing,
       * so that the step is not re-evaluated in a subsequent iteration of `processSteps`.
       */
      processedStepIds.push(currentStep.stepId);

      /* With no items, the step is complete now, with an empty collected output. Otherwise its last branch completes it. */
      const status = completeForEachStep({
        flow,
        flowDefinition,
        forEachStep: currentStep,
        processedStepIds,
      });

      if (status.code !== StatusCode.Ok) {
        processStepErrors[currentStepId] = {
          code: status.code,
          message: status.message,
        };
      }
    }
  };

  /**
   * Skips every step that can never run because a value it needs is missing, repeating until no more are
   * skipped, since skipping a step can skip the steps that depend on it.
   */
  let skippedStepCountInMemo = 0;

  const skipUnrunnableSteps = () => {
    let skippedAny = true;

    while (skippedAny) {
      skippedAny = false;

      for (const step of getAllStepsInFlow(flow)) {
        if (
          !processedStepIds.includes(step.stepId) &&
          getStepReadiness({
            step,
            flow,
            flowDefinition,
            processedStepIds,
            skippedStepIds,
            failedStepIds: Object.keys(processStepErrors),
          }) === "skip"
        ) {
          log(
            `Step ${step.stepId}: skipped, because a value it needs is missing`,
          );

          processedStepIds.push(step.stepId);
          skippedStepIds.push(step.stepId);
          skippedSteps.push({
            stepId: step.stepId,
            stepType:
              step.kind === "action" ? step.actionDefinitionId : "forEach",
            skippedAt: new Date().toISOString(),
          });
          skippedAny = true;

          const status = collectSkippedBranchStep({
            flow,
            flowDefinition,
            stepId: step.stepId,
            processedStepIds,
          });

          if (status.code !== StatusCode.Ok) {
            processStepErrors[step.stepId] = {
              code: status.code,
              message: status.message,
            };
          }
        }
      }
    }

    if (skippedSteps.length > skippedStepCountInMemo) {
      upsertMemo({ skippedSteps });
      skippedStepCountInMemo = skippedSteps.length;
    }
  };

  const isReadyToProcess = (step: FlowStep) =>
    !processedStepIds.includes(step.stepId) &&
    getStepReadiness({
      step,
      flow,
      flowDefinition,
      processedStepIds,
      skippedStepIds,
      failedStepIds: Object.keys(processStepErrors),
    }) === "ready";

  /*
   * Skip the steps that can't run first: a flow whose first steps are all skipped, or that has no steps, has
   * nothing to run, but hasn't failed.
   */
  skipUnrunnableSteps();

  const allSteps = getAllStepsInFlow(flow);

  if (
    !allSteps.some(isReadyToProcess) &&
    allSteps.some(({ stepId }) => !processedStepIds.includes(stepId))
  ) {
    const errorMessage =
      "No steps have satisfied dependencies when initializing the flow.";
    throw ApplicationFailure.create({
      message: errorMessage,
      details: [
        {
          code: StatusCode.FailedPrecondition,
          message: errorMessage,
          contents: [{ flow }],
        },
      ],
    });
  }

  // Recursively process steps which have satisfied dependencies
  const processSteps = async () => {
    skipUnrunnableSteps();

    const stepsToProcess = getAllStepsInFlow(flow).filter(isReadyToProcess);

    // There are no more steps which can be processed, so we exit the recursive loop
    if (stepsToProcess.length === 0) {
      return;
    }

    await Promise.all(stepsToProcess.map((step) => processStep(step.stepId)));

    const lastStepIds = stepsToProcess.map((step) => step.stepId);

    await persistFlowActivity({
      flow,
      stepIds: lastStepIds,
      userAuthentication,
      webId,
    });

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
  await sleep(2_000);

  const stepErrors = Object.entries(processStepErrors).map(
    ([stepId, status]) => ({ ...status, contents: [{ stepId }] }),
  );

  /** @todo this is not necessarily an error once there are branches */
  if (processedStepIds.length !== getAllStepsInFlow(flow).length) {
    const errorMessage = "Not all steps in the flows were processed.";
    throw ApplicationFailure.create({
      message: errorMessage,
      details: [
        {
          code: StatusCode.Unknown,
          message: errorMessage,
          contents: [{ flow, stepErrors }],
        },
      ],
    });
  }

  for (const outputDefinition of flowDefinition.outputs) {
    const step = getAllStepsInFlow(flow).find(
      (flowStep) => flowStep.stepId === outputDefinition.stepId,
    );

    const output =
      step?.kind === "action"
        ? step.outputs?.find(
            ({ outputName }) => outputName === outputDefinition.outputName,
          )
        : step?.collected;

    if (!output) {
      if (
        !isRequiredFlowOutput(flowDefinition, outputDefinition, skippedStepIds)
      ) {
        continue;
      }

      const errorMessage = `Error processing output definition '${outputDefinition.name}': step '${outputDefinition.stepId}' did not produce its required output '${outputDefinition.outputName}'`;

      throw ApplicationFailure.create({
        message: errorMessage,
        details: [
          {
            code: StatusCode.NotFound,
            message: errorMessage,
            contents: [{ flow, stepErrors }],
          },
        ],
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

  await persistFlowActivity({
    flow,
    stepIds: ["complete-flow"],
    userAuthentication,
    webId,
  });

  const outputs = flow.outputs ?? [];

  return {
    /**
     * Steps may error and be retried, or the whole workflow retried, while still producing the required outputs
     * – start with an initial status of OK if the outputs are present, to be adjusted if necessary.
     */
    code: flowDefinition.outputs.every(
      (outputDefinition) =>
        !isRequiredFlowOutput(
          flowDefinition,
          outputDefinition,
          skippedStepIds,
        ) ||
        outputs.some(({ outputName }) => outputName === outputDefinition.name),
    )
      ? StatusCode.Ok
      : StatusCode.Internal,
    contents: [{ outputs, stepErrors }],
  };
};

export const processFlowWorkflow: typeof processFlow = async (params) => {
  let result: RunFlowWorkflowResponse;

  try {
    result = await processFlow(params);
  } catch (error) {
    const runFailure = toRunFailure(error);
    const ending = getFailedRunEnding(runFailure);

    if (ending) {
      await recordFlowRun({
        ending,
        userAuthentication: params.userAuthentication,
      });
    }

    throw runFailure;
  }

  const { outputs, stepErrors } = result.contents[0] ?? {};

  await recordFlowRun({
    ending: {
      kind: "completed",
      flowOutputs: outputs ?? [],
      ...(stepErrors ? { stepErrors: toStepErrors(stepErrors) } : {}),
    },
    userAuthentication: params.userAuthentication,
  });

  return result;
};
