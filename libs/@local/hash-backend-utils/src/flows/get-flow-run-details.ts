import { WorkflowNotFoundError } from "@temporalio/client";
import proto from "@temporalio/proto";

import { generateStepRunId } from "@local/hash-isomorphic-utils/flows/step-run-id";
import {
  FlowRunStatus,
  FlowStepStatus,
} from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { StatusCode } from "@local/status";

import { resolvePayloadValue } from "./payload-storage.js";
import {
  getFlowRunRecord,
  getFlowRunRecordFromHistory,
  readStoredFlowRunRecord,
} from "./run-record.js";

import type { FileStorageProvider } from "../file-storage.js";
import type { ResolvePayloadContext } from "./payload-storage.js";
import type {
  FlowRunHistoryRecord,
  FlowRunRecordsByWorkflowId,
} from "./run-record.js";
import type { EntityId, EntityUuid, WebId } from "@blockprotocol/type-system";
import type {
  FlowRunEvent,
  FlowRunEventStepRun,
  FlowStepGaveUpReason,
} from "@local/hash-isomorphic-utils/flows/run-events";
import type {
  FlowRunRecord,
  FlowRunRecordHeader,
} from "@local/hash-isomorphic-utils/flows/run-record";
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
  StepRun,
} from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import type { Client as TemporalClient } from "@temporalio/client";

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
          {
            code: StatusCode.Ok,
            ...(event.message ? { message: event.message } : {}),
            contents: [{ outputs: event.outputs }],
          },
        ];
        stepRun.status = FlowStepStatus.Completed;
        stepRun.closedAt = event.occurredAt;
        break;
      }

      case "stepGaveUp": {
        const message =
          activity.attemptFailed?.error.message ?? "Unknown error";

        stepRun.closedAt = event.occurredAt;

        if (event.reason === "errorStatus") {
          /* The event keeps the status's message, not its code. */
          stepRun.outputs = [
            { code: StatusCode.Unknown, message, contents: [] },
          ];
          stepRun.status = FlowStepStatus.Failed;
          break;
        }

        stepRun.lastFailure = { message };
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
            message,
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

const stoppedEarlyStatuses: FlowRunStatus[] = [
  FlowRunStatus.Terminated,
  FlowRunStatus.Cancelled,
  FlowRunStatus.TimedOut,
  FlowRunStatus.Failed,
];

/**
 * A run's detailed fields, from its record. Stored payloads in outputs are resolved through `resolvePayloadContext`.
 */
export const getFlowRunDetailedFieldsFromRecord = async (
  { header, events: runEvents }: FlowRunRecord,
  resolvePayloadContext: ResolvePayloadContext,
): Promise<Pick<FlowRun, DetailedFlowField | "startedAt">> => {
  const inputRequests = getInputRequests(runEvents);

  const workflowStoppedEarly = stoppedEarlyStatuses.includes(header.status);

  const stepRunsById = getStepRunsFromActivityEvents(runEvents, {
    workflowStoppedEarly,
    workflowClosedAt: header.closedAt,
  });

  for (const event of runEvents) {
    if (event.kind !== "progressLogged") {
      continue;
    }

    const stepRun = stepRunsById.get(event.log.stepId);
    if (!stepRun) {
      throw new Error(
        `No step run ${event.log.stepId} for the log at ${event.position}`,
      );
    }

    stepRun.logs.push(event.log);
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
      if (!step.outputs) {
        return step as StepRun;
      }

      const resolvedOutputs = await Promise.all(
        step.outputs.map(async (output) => {
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
  const workflowOutputs = header.outputs as StepRunOutput[] | undefined;
  let resolvedWorkflowOutputs: ResolvedStepRunOutput[] | undefined;
  if (workflowOutputs) {
    resolvedWorkflowOutputs = await Promise.all(
      workflowOutputs.map(async (output) => {
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
    failureMessage: header.failureMessage,
    flowInputs: header.flowInputs,
    dataSources: header.dataSources,
    outputs: resolvedWorkflowOutputs,
    inputRequests,
    steps,
    startedAt: header.firstRunStartedAt ?? header.startedAt,
  };
};

/**
 * A run's detailed fields, from its description and history. Stored payloads in outputs are resolved through
 * `resolvePayloadContext`.
 */
export const getFlowRunDetailedFieldsFromHistory = (
  historyRecord: FlowRunHistoryRecord,
  resolvePayloadContext: ResolvePayloadContext,
): Promise<Pick<FlowRun, DetailedFlowField | "startedAt">> =>
  getFlowRunDetailedFieldsFromRecord(
    getFlowRunRecordFromHistory(historyRecord, {
      workflowId: resolvePayloadContext.workflowId,
    }),
    resolvePayloadContext,
  );

type FlowRunLinkedFields = {
  /** The flow definition the run `Uses`, from its link */
  flowDefinitionEntityId: EntityId;
  /** The entity id of the flow run */
  flowRunEntityId: EntityId;
  /** The schedule the run was `Triggered By`, if any, from its link */
  flowScheduleId?: EntityUuid;
  name: string;
  webId: WebId;
};

const toSparseFlowRun = (
  {
    flowDefinitionEntityId,
    flowRunEntityId,
    flowScheduleId,
    name,
    webId,
  }: FlowRunLinkedFields,
  {
    status,
    startedAt,
    executedAt,
    closedAt,
  }: Pick<
    FlowRunRecordHeader,
    "status" | "startedAt" | "executedAt" | "closedAt"
  >,
): SparseFlowRun => ({
  name,
  flowDefinitionEntityId,
  flowRunEntityId,
  flowScheduleId,
  status,
  startedAt,
  executedAt,
  closedAt,
  webId,
});

/**
 * A run's status and times, from Temporal, or from the record it wrote when it ended if Temporal no longer has it.
 */
export const getSparseFlowRunFromTemporalWorkflowId = async ({
  temporalClient,
  temporalWorkflowId,
  storageProvider,
  ...linkedFields
}: FlowRunLinkedFields & {
  temporalClient: TemporalClient;
  /** the identifier for the Temporal workflow */
  temporalWorkflowId: string;
  /** Storage provider for reading the run's record */
  storageProvider: FileStorageProvider;
}): Promise<SparseFlowRun> => {
  try {
    const { startTime, executionTime, closeTime, status } =
      await temporalClient.workflow.getHandle(temporalWorkflowId).describe();

    return toSparseFlowRun(linkedFields, {
      status: status.name as FlowRunStatus,
      startedAt: startTime.toISOString(),
      executedAt: executionTime?.toISOString(),
      closedAt: closeTime?.toISOString(),
    });
  } catch (error) {
    if (!(error instanceof WorkflowNotFoundError)) {
      throw error;
    }

    const storedRecord = await readStoredFlowRunRecord({
      storageProvider,
      workflowId: temporalWorkflowId,
    });

    if (!storedRecord) {
      throw error;
    }

    return toSparseFlowRun(linkedFields, storedRecord.header);
  }
};

export const getFlowRunFromTemporalWorkflowId = async ({
  temporalClient,
  temporalWorkflowId,
  storageProvider,
  recordsByWorkflowId,
  ...linkedFields
}: FlowRunLinkedFields & {
  temporalClient: TemporalClient;
  /** the identifier for the Temporal workflow */
  temporalWorkflowId: string;
  /** Storage provider for reading the run's record and resolving stored payload references */
  storageProvider: FileStorageProvider;
  /** Records already read in this request, to reuse */
  recordsByWorkflowId?: FlowRunRecordsByWorkflowId;
}): Promise<FlowRunWithoutEvents> => {
  const record = await getFlowRunRecord({
    temporalClient,
    storageProvider,
    workflowId: temporalWorkflowId,
    recordsByWorkflowId,
  });

  return {
    ...toSparseFlowRun(linkedFields, record.header),
    ...(await getFlowRunDetailedFieldsFromRecord(record, {
      storageProvider,
      workflowId: temporalWorkflowId,
    })),
  };
};
