import { WorkflowNotFoundError } from "@temporalio/client";
import proto from "@temporalio/proto";

import {
  findRunFinishedEvent,
  getInputRequests,
} from "@local/hash-isomorphic-utils/flows/run-events";
import { generateStepRunId } from "@local/hash-isomorphic-utils/flows/step-run-id";
import { getStepRunsFromEvents } from "@local/hash-isomorphic-utils/flows/step-runs";
import {
  FlowRunStatus,
  FlowStepStatus,
} from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { StatusCode } from "@local/status";

import { resolvePayloadValue } from "./payload-storage.js";
import { getFlowRunRecord, readStoredFlowRunRecord } from "./run-record.js";

import type { FileStorageProvider } from "../file-storage.js";
import type { ResolvePayloadContext } from "./payload-storage.js";
import type { FlowRunRecordsByWorkflowId } from "./run-record.js";
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
import type { FlowRunStepRunState } from "@local/hash-isomorphic-utils/flows/step-runs";
import type {
  DetailedFlowField,
  FlowRunWithoutEvents,
  ResolvedPayload,
  ResolvedStepOutput,
  SparseFlowRun,
  StepInput,
  StepOutput,
} from "@local/hash-isomorphic-utils/flows/types";
import type {
  FlowRun,
  StepRun,
} from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import type { Status } from "@local/status";
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
 * A step run as the `steps` field gives it: its outputs wrapped in the status its action returned, with stored payloads
 * resolved, and its give-up reason as a Temporal retry state.
 */
const toStepRun = async (
  {
    gaveUpReason,
    outputs,
    outputsMessage,
    errorStatus,
    inputs,
    ...stepRun
  }: FlowRunStepRunState,
  resolvePayloadContext: ResolvePayloadContext,
): Promise<StepRun> => ({
  ...stepRun,
  /* Clients receive the action activity's arguments as a step run's inputs, not the `StepInput`s the schema declares. */
  inputs:
    stepRun.status === FlowStepStatus.Skipped
      ? inputs
      : ([{ inputs }] as unknown as StepInput[]),
  ...(gaveUpReason
    ? { retryState: retryStateByGaveUpReason[gaveUpReason] }
    : {}),
  ...(outputs
    ? {
        outputs: [
          {
            code: StatusCode.Ok,
            ...(outputsMessage ? { message: outputsMessage } : {}),
            contents: [
              {
                outputs:
                  (await resolveStoredPayloadsInOutputs(
                    outputs,
                    resolvePayloadContext,
                  )) ?? [],
              },
            ],
          },
        ],
      }
    : errorStatus
      ? {
          /* The event keeps the status's message, not its code. */
          outputs: [
            {
              code: StatusCode.Unknown,
              message: errorStatus.message,
              contents: [],
            },
          ],
        }
      : {}),
});

/**
 * A completed run's outputs as GraphQL gives them: as its workflow returned them, with stored payloads resolved. The
 * run's status is OK, and a step error recorded before its code was is UNKNOWN.
 */
const getWorkflowOutputs = async (
  { flowOutputs, stepErrors }: FlowRunEventOfKind<"runFinished">,
  resolvePayloadContext: ResolvePayloadContext,
): Promise<
  | Status<{
      outputs: ResolvedStepOutput[];
      stepErrors?: Status<{ stepId: string }>[];
    }>[]
  | undefined
> => {
  if (!flowOutputs) {
    return undefined;
  }

  return [
    {
      code: StatusCode.Ok,
      contents: [
        {
          outputs:
            (await resolveStoredPayloadsInOutputs(
              flowOutputs,
              resolvePayloadContext,
            )) ?? [],
          ...(stepErrors
            ? {
                stepErrors: stepErrors.map(({ stepRun, error }) => ({
                  code: error.code ?? StatusCode.Unknown,
                  message: error.message,
                  contents: [{ stepId: toStepRunId(stepRun) }],
                })),
              }
            : {}),
        },
      ],
    },
  ];
};

/**
 * A run's detailed fields, from its record. Stored payloads in outputs are resolved through `resolvePayloadContext`.
 */
export const getFlowRunDetailedFieldsFromRecord = async (
  { header, events: runEvents }: FlowRunRecord,
  resolvePayloadContext: ResolvePayloadContext,
): Promise<Pick<FlowRun, DetailedFlowField | "startedAt">> => {
  const steps = await Promise.all(
    getStepRunsFromEvents(runEvents, header).map((stepRun) =>
      toStepRun(stepRun, resolvePayloadContext),
    ),
  );

  const runStartedEvent = runEvents.find(
    (event): event is FlowRunEventOfKind<"runStarted"> =>
      event.kind === "runStarted",
  );

  if (!runStartedEvent) {
    throw new Error("No workflow inputs found");
  }

  const runFinishedEvent = findRunFinishedEvent(runEvents);

  return {
    failureMessage:
      runFinishedEvent?.status === FlowRunStatus.Failed
        ? runFinishedEvent.failure?.message
        : undefined,
    flowInputs: runStartedEvent.flowInputs,
    dataSources: header.dataSources,
    outputs: runFinishedEvent
      ? await getWorkflowOutputs(runFinishedEvent, resolvePayloadContext)
      : undefined,
    inputRequests: getInputRequests(runEvents),
    steps,
    startedAt: header.firstRunStartedAt ?? header.startedAt,
  };
};

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
