import proto from "@temporalio/proto";

import { generateStepRunId } from "@local/hash-isomorphic-utils/flows/step-run-id";
import { FlowStepStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { StatusCode } from "@local/status";

import { parseHistoryItemPayload } from "../temporal/parse-history-item-payload.js";
import { resolvePayloadValue } from "./payload-storage.js";
import { buildFlowRunEvents, getFlowRunHistory } from "./run-events.js";

import type { FileStorageProvider } from "../file-storage.js";
import type { ResolvePayloadContext } from "./payload-storage.js";
import type { FlowRunHistoriesByWorkflowId } from "./run-events.js";
import type { EntityId, EntityUuid, WebId } from "@blockprotocol/type-system";
import type {
  FlowRunEvent,
  FlowRunEventStepRun,
  FlowStepGaveUpReason,
} from "@local/hash-isomorphic-utils/flows/run-events";
import type { RunFlowWorkflowParams } from "@local/hash-isomorphic-utils/flows/temporal-types";
import type {
  DetailedFlowField,
  ExternalInputRequest,
  FlowRunWithoutEvents,
  ResolvedPayload,
  ResolvedStepOutput,
  ResolvedStepRunOutput,
  SparseFlowRun,
  StepInput,
  StepOutput,
  StepRunOutput,
} from "@local/hash-isomorphic-utils/flows/types";
import type {
  FlowRun,
  FlowRunStatus,
  StepRun,
} from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import type {
  Client as TemporalClient,
  WorkflowExecutionStatusName,
} from "@temporalio/client";

type IHistoryEvent = proto.temporal.api.history.v1.IHistoryEvent;

/**
 * Resolve any stored payloads in step outputs, downloading the actual payload data from S3 in place of their
 * references. `resolvePayloadValue` caches downloads, so outputs that share stored objects fetch them once.
 *
 * @param outputs - The step outputs to resolve
 * @param context - The storage provider to retrieve payloads from, and the run's workflow id
 */
const resolveStoredPayloadsInOutputs = async (
  outputs: StepOutput[] | undefined,
  context: ResolvePayloadContext,
): Promise<ResolvedStepOutput[] | undefined> => {
  if (!outputs) {
    return outputs;
  }

  return Promise.all(
    outputs.map(
      async (output) =>
        ({
          ...output,
          payload: {
            kind: output.payload.kind,
            value: await resolvePayloadValue(
              context,
              output.payload.kind,
              output.payload.value,
            ),
          } as ResolvedPayload,
        }) satisfies ResolvedStepOutput,
    ),
  );
};

type UnresolvedStepRun = Omit<StepRun, "outputs"> & {
  outputs?: StepRunOutput[] | null;
};

type FlowRunEventOfKind<Kind extends FlowRunEvent["kind"]> = Extract<
  FlowRunEvent,
  { kind: Kind }
>;

const { RetryState } = proto.temporal.api.enums.v1;

/** The Temporal retry state a step gave up in, as a string, where its reason determines one. */
const retryStateByGaveUpReason: Partial<Record<FlowStepGaveUpReason, string>> =
  {
    attemptsExhausted: String(RetryState.RETRY_STATE_MAXIMUM_ATTEMPTS_REACHED),
    nonRetryable: String(RetryState.RETRY_STATE_NON_RETRYABLE_FAILURE),
    timedOut: String(RetryState.RETRY_STATE_TIMEOUT),
  };

const toStepRunId = ({ stepId, itemPath: [itemIndex] }: FlowRunEventStepRun) =>
  itemIndex === undefined ? stepId : generateStepRunId(stepId, itemIndex);

/**
 * Each step run's state after its latest activity event, latest first: its last scheduling's inputs, its latest
 * attempt, and what happened last. A step still scheduled or running when its run stopped early counts as cancelled.
 */
const getStepRunsFromActivityEvents = (
  runEvents: FlowRunEvent[],
  {
    workflowStoppedEarly,
    workflowClosedAt,
  }: { workflowStoppedEarly: boolean; workflowClosedAt?: string },
): Map<string, UnresolvedStepRun> => {
  const activitiesByStepRunId = new Map<
    string,
    {
      stepStarted: FlowRunEventOfKind<"stepStarted">;
      attemptStarted?: FlowRunEventOfKind<"attemptStarted">;
      attemptFailed?: FlowRunEventOfKind<"attemptFailed">;
    }
  >();
  const stepRunsById = new Map<string, UnresolvedStepRun>();

  for (const event of runEvents) {
    if (
      event.kind !== "stepStarted" &&
      event.kind !== "attemptStarted" &&
      event.kind !== "attemptSucceeded" &&
      event.kind !== "attemptFailed" &&
      event.kind !== "stepGaveUp" &&
      event.kind !== "attemptCancellationRequested" &&
      event.kind !== "attemptCancelled"
    ) {
      continue;
    }

    const stepRunId = toStepRunId(event.stepRun);

    if (event.kind === "stepStarted") {
      activitiesByStepRunId.set(stepRunId, { stepStarted: event });
    }

    const activity = activitiesByStepRunId.get(stepRunId);
    if (!activity) {
      throw new Error(
        `Step run ${stepRunId} has a ${event.kind} event at ${event.position} before it started`,
      );
    }

    if (event.kind === "attemptStarted") {
      activity.attemptStarted = event;
    } else if (event.kind === "attemptFailed") {
      /* Always followed by the step giving up, which records the step's state. */
      activity.attemptFailed = event;
      continue;
    }

    const { stepStarted, attemptStarted } = activity;

    const stepRun: UnresolvedStepRun = {
      stepId: stepRunId,
      stepType: `${stepStarted.stepType}Action`,
      startedAt: attemptStarted?.occurredAt,
      scheduledAt: stepStarted.occurredAt,
      closedAt: workflowStoppedEarly ? workflowClosedAt : "",
      /* Clients receive the action activity's arguments as a step run's inputs, not the `StepInput`s the schema declares. */
      inputs: [{ inputs: stepStarted.inputs }] as unknown as StepInput[],
      logs: [],
      status: workflowStoppedEarly
        ? FlowStepStatus.Cancelled
        : FlowStepStatus.Scheduled,
      attempt: attemptStarted?.attempt ?? 1,
    };

    switch (event.kind) {
      case "stepStarted":
        break;

      case "attemptStarted": {
        if (!workflowStoppedEarly) {
          const lastError = event.hiddenAttempts?.lastError;

          stepRun.status = FlowStepStatus.Started;
          stepRun.lastFailure = lastError;
          stepRun.logs.push({
            type: "ActivityFailed",
            stepId: stepRunId,
            recordedAt: event.occurredAt,
            retrying: true,
            message: lastError?.message ?? "Unknown error",
          });
        }
        break;
      }

      case "attemptSucceeded": {
        stepRun.outputs = [
          { code: StatusCode.Ok, contents: [{ outputs: event.outputs }] },
        ];
        stepRun.status = FlowStepStatus.Completed;
        stepRun.closedAt = event.occurredAt;
        break;
      }

      case "stepGaveUp": {
        const error = activity.attemptFailed?.error ?? {
          message: "Unknown error",
        };

        stepRun.closedAt = event.occurredAt;

        if (event.reason === "errorStatus") {
          /* The event keeps the status's message, not its code. */
          stepRun.outputs = [
            { code: StatusCode.Unknown, message: error.message, contents: [] },
          ];
          stepRun.status = FlowStepStatus.Failed;
          break;
        }

        stepRun.lastFailure = error;
        stepRun.retryState = retryStateByGaveUpReason[event.reason];

        if (event.reason === "timedOut") {
          stepRun.status = FlowStepStatus.TimedOut;
        } else {
          stepRun.status = FlowStepStatus.Failed;
          stepRun.logs.push({
            type: "ActivityFailed",
            stepId: stepRunId,
            recordedAt: event.occurredAt,
            retrying: false,
            message: error.message,
          });
        }
        break;
      }

      case "attemptCancellationRequested": {
        stepRun.status = FlowStepStatus.CancelRequested;
        break;
      }

      case "attemptCancelled": {
        stepRun.status = FlowStepStatus.Cancelled;
        stepRun.closedAt = event.occurredAt;
        break;
      }
    }

    stepRunsById.delete(stepRunId);
    stepRunsById.set(stepRunId, stepRun);
  }

  return new Map([...stepRunsById].reverse());
};

const findWorkflowExecutionStartedEventAttributes = (events: IHistoryEvent[]) =>
  events.find(
    (event) =>
      event.eventType ===
      proto.temporal.api.enums.v1.EventType
        .EVENT_TYPE_WORKFLOW_EXECUTION_STARTED,
  )?.workflowExecutionStartedEventAttributes;

/**
 * A run's input requests, from its events, latest first. A request takes its data and time from its first signal, and
 * once answered, its answer and time from its first response. An answered request's `stepId` is `"unresolved"`.
 */
const getInputRequests = (
  runEvents: FlowRunEvent[],
): ExternalInputRequest[] => {
  const inputRequestsById = new Map<string, ExternalInputRequest>();
  const lastEventIndexByRequestId = new Map<string, number>();

  for (const [index, event] of runEvents.entries()) {
    if (event.kind !== "inputRequested" && event.kind !== "inputResolved") {
      continue;
    }

    const requestId =
      event.kind === "inputRequested"
        ? event.request.requestId
        : event.requestId;
    const existingRequest = inputRequestsById.get(requestId);

    lastEventIndexByRequestId.set(requestId, index);

    if (existingRequest?.resolvedAt) {
      continue;
    }

    if (event.kind === "inputRequested") {
      inputRequestsById.set(requestId, {
        ...event.request,
        raisedAt: event.occurredAt,
      });
    } else {
      const { data, type } = event.response;

      inputRequestsById.set(requestId, {
        data: (existingRequest?.data ?? {}) as never,
        answers: "answers" in data ? data.answers : undefined,
        requestId,
        stepId: "unresolved",
        type,
        raisedAt: existingRequest?.raisedAt ?? "",
        resolvedAt: event.occurredAt,
      });
    }
  }

  return [...inputRequestsById.values()].sort(
    (left, right) =>
      (lastEventIndexByRequestId.get(right.requestId) ?? 0) -
      (lastEventIndexByRequestId.get(left.requestId) ?? 0),
  );
};

/**
 * A run's Temporal description and history, with times as ISO strings: the shape of the recorded history fixtures.
 */
export type FlowRunHistoryRecord = {
  describe: {
    runId: string;
    status: WorkflowExecutionStatusName;
    startTime: string;
    closeTime?: string | null;
  };
  history: IHistoryEvent[];
  /**
   * When the run's first execution started, if this run was started by resetting or continuing it.
   */
  originalRunStartTime?: string;
};

/**
 * A run's detailed fields, from its description and history. Stored payloads in outputs are resolved through
 * `resolvePayloadContext`.
 */
export const getFlowRunDetailedFieldsFromHistory = async (
  {
    describe: workflow,
    history: events,
    originalRunStartTime,
  }: FlowRunHistoryRecord,
  resolvePayloadContext: ResolvePayloadContext,
): Promise<Pick<FlowRun, DetailedFlowField | "startedAt">> => {
  const workflowExecutionStartedEventAttributes =
    findWorkflowExecutionStartedEventAttributes(events);

  /* `runFlow` takes one argument: its params. */
  const [workflowParams] =
    (parseHistoryItemPayload(workflowExecutionStartedEventAttributes?.input) as
      | [RunFlowWorkflowParams]
      | undefined) ?? [];

  const workflowOutputs = parseHistoryItemPayload(
    events.find(
      (event) =>
        event.eventType ===
        proto.temporal.api.enums.v1.EventType
          .EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED,
    )?.workflowExecutionCompletedEventAttributes?.result,
  );

  const workflowFailureMessage = events.find(
    (event) =>
      event.eventType ===
      proto.temporal.api.enums.v1.EventType
        .EVENT_TYPE_WORKFLOW_EXECUTION_FAILED,
  )?.workflowExecutionFailedEventAttributes?.failure?.message;

  const runEvents = buildFlowRunEvents(events);

  const inputRequests = getInputRequests(runEvents);

  const workflowStoppedEarly = [
    "TERMINATED",
    "CANCELED",
    "TIMED_OUT",
    "FAILED",
  ].includes(workflow.status);

  const stepRunsById = getStepRunsFromActivityEvents(runEvents, {
    workflowStoppedEarly,
    workflowClosedAt: workflow.closeTime ?? undefined,
  });

  for (const event of runEvents) {
    if (event.kind !== "progressLogged") {
      continue;
    }

    const { log } = event;
    const stepRun = stepRunsById.get(log.stepId);

    if (!stepRun) {
      throw new Error(
        log.type === "ResearchActionCheckpoint"
          ? `Could not find step with id ${log.stepId} for checkpoint with id ${log.checkpointId}`
          : `No activity record found for step with id ${log.stepId}`,
      );
    }

    stepRun.logs.push(log);
  }

  for (const inputRequest of inputRequests) {
    if (!workflowStoppedEarly && !inputRequest.resolvedAt) {
      const step = stepRunsById.get(inputRequest.stepId);
      if (!step) {
        throw new Error(
          `Could not find step with id ${inputRequest.stepId} for input request with id ${inputRequest.requestId}`,
        );
      }
      step.status = FlowStepStatus.InformationRequired;
    }
  }

  if (!workflowParams) {
    throw new Error("No workflow inputs found");
  }

  for (const event of runEvents) {
    if (event.kind !== "stepSkipped") {
      continue;
    }

    const stepRunId = toStepRunId(event.stepRun);

    stepRunsById.set(stepRunId, {
      stepId: stepRunId,
      stepType: event.stepType,
      scheduledAt: event.occurredAt,
      closedAt: event.occurredAt,
      attempt: 0,
      inputs: [],
      logs: [],
      status: FlowStepStatus.Skipped,
    });
  }

  for (const step of stepRunsById.values()) {
    step.logs.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  }

  // Resolve any stored payload references in step outputs
  const steps: StepRun[] = await Promise.all(
    [...stepRunsById.values()].map(async (step) => {
      // The outputs in stepMap are from Temporal history - Status<{outputs: StepOutput[]}> objects
      // We need to resolve stored refs in the actual step outputs within those Status objects
      if (!step.outputs) {
        return step as StepRun;
      }

      const resolvedOutputs = await Promise.all(
        step.outputs.map(async (output) => {
          // output is Status<{outputs: StepOutput[]}>
          const firstContent = output.contents[0];
          if (!firstContent?.outputs) {
            return output as ResolvedStepRunOutput;
          }

          const resolvedInnerOutputs = await resolveStoredPayloadsInOutputs(
            firstContent.outputs,
            resolvePayloadContext,
          );

          return {
            ...output,
            contents: [
              {
                ...firstContent,
                outputs: resolvedInnerOutputs ?? [],
              },
            ],
          };
        }),
      );

      return {
        ...step,
        outputs: resolvedOutputs,
      };
    }),
  );

  // Resolve stored payload references in workflow outputs for consistency with step outputs.
  let resolvedWorkflowOutputs: ResolvedStepRunOutput[] | undefined;
  if (workflowOutputs && Array.isArray(workflowOutputs)) {
    resolvedWorkflowOutputs = await Promise.all(
      (workflowOutputs as StepRunOutput[]).map(async (output) => {
        const firstContent = output.contents[0];
        if (!firstContent?.outputs) {
          return output as ResolvedStepRunOutput;
        }

        const resolvedInnerOutputs = await resolveStoredPayloadsInOutputs(
          firstContent.outputs,
          resolvePayloadContext,
        );

        return {
          ...output,
          contents: [
            {
              ...firstContent,
              outputs: resolvedInnerOutputs ?? [],
            },
          ],
        };
      }),
    );
  }

  return {
    failureMessage: workflowFailureMessage,
    flowInputs: workflowParams.flowInputs,
    dataSources:
      "dataSources" in workflowParams ? workflowParams.dataSources : undefined,
    outputs: resolvedWorkflowOutputs ?? workflowOutputs,
    inputRequests,
    steps,
    startedAt: originalRunStartTime ?? workflow.startTime,
  };
};

const getFlowRunDetailedFields = async ({
  workflowId,
  temporalClient,
  storageProvider,
  historiesByWorkflowId,
}: {
  workflowId: string;
  temporalClient: TemporalClient;
  /** Storage provider for resolving stored payload references */
  storageProvider: FileStorageProvider;
  historiesByWorkflowId?: FlowRunHistoriesByWorkflowId;
}): Promise<Pick<FlowRun, DetailedFlowField | "startedAt">> => {
  const { workflow, history } = await getFlowRunHistory({
    temporalClient,
    workflowId,
    historiesByWorkflowId,
  });

  /**
   * If this workflow run has been started after the original was reset or 'continue-as-new'd,
   * its start time will be the point at which it was reset/continued.
   * We can check if it has a different firstExecutionRunId and if so, get the start time of the original run.
   */
  let originalRunStartTime: string | undefined;
  const firstExecutionRunId =
    findWorkflowExecutionStartedEventAttributes(history)?.firstExecutionRunId;

  if (firstExecutionRunId && firstExecutionRunId !== workflow.runId) {
    const originalRunHandle = temporalClient.workflow.getHandle(
      workflowId,
      firstExecutionRunId,
    );

    try {
      const originalRun = await originalRunHandle.describe();

      originalRunStartTime = originalRun.startTime.toISOString();
    } catch {
      /**
       * The original run is not available, likely because it is no longer retained by Temporal.
       * @todo H-3142: save workflow history in our database so we don't rely on Temporal for old runs
       */
      // eslint-disable-next-line no-console
      console.warn(
        `Could not find original run with id ${firstExecutionRunId} for workflow ${workflowId}`,
      );
    }
  }

  return getFlowRunDetailedFieldsFromHistory(
    {
      describe: {
        runId: workflow.runId,
        status: workflow.status.name,
        startTime: workflow.startTime.toISOString(),
        closeTime: workflow.closeTime?.toISOString(),
      },
      history,
      originalRunStartTime,
    },
    { storageProvider, workflowId },
  );
};

export const getSparseFlowRunFromTemporalWorkflowId = async ({
  flowDefinitionEntityId,
  flowRunEntityId,
  flowScheduleId,
  name,
  temporalClient,
  temporalWorkflowId,
  webId,
}: {
  /** The flow definition the run `Uses`, from its link */
  flowDefinitionEntityId: EntityId;
  /** The entity id of the flow run */
  flowRunEntityId: EntityId;
  /** The schedule the run was `Triggered By`, if any, from its link */
  flowScheduleId?: EntityUuid;
  name: string;
  temporalClient: TemporalClient;
  /** the identifier for the Temporal workflow */
  temporalWorkflowId: string;
  webId: WebId;
}): Promise<SparseFlowRun> => {
  const handle = temporalClient.workflow.getHandle(temporalWorkflowId);

  const { startTime, executionTime, closeTime, status } =
    await handle.describe();

  return {
    name,
    flowDefinitionEntityId,
    flowRunEntityId,
    flowScheduleId,
    status: status.name as FlowRunStatus,
    startedAt: startTime.toISOString(),
    executedAt: executionTime?.toISOString(),
    closedAt: closeTime?.toISOString(),
    webId,
  };
};

export const getFlowRunFromTemporalWorkflowId = async (args: {
  /** The flow definition the run `Uses`, from its link */
  flowDefinitionEntityId: EntityId;
  /** The entity id of the flow run */
  flowRunEntityId: EntityId;
  /** The schedule the run was `Triggered By`, if any, from its link */
  flowScheduleId?: EntityUuid;
  name: string;
  temporalClient: TemporalClient;
  /** the identifier for the Temporal workflow */
  temporalWorkflowId: string;
  webId: WebId;
  /** Storage provider for resolving stored payload references */
  storageProvider: FileStorageProvider;
  /** Histories already read in this request, to reuse */
  historiesByWorkflowId?: FlowRunHistoriesByWorkflowId;
}): Promise<FlowRunWithoutEvents> => {
  const baseFields = await getSparseFlowRunFromTemporalWorkflowId(args);
  const detailedFields = await getFlowRunDetailedFields({
    workflowId: args.temporalWorkflowId,
    temporalClient: args.temporalClient,
    storageProvider: args.storageProvider,
    historiesByWorkflowId: args.historiesByWorkflowId,
  });

  return {
    ...baseFields,
    ...detailedFields,
  };
};
