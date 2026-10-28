import { WorkflowNotFoundError } from "@temporalio/client";

import { getFlowRunRecord, readStoredFlowRunRecord } from "./run-record.js";

import type { FileStorageProvider } from "../file-storage.js";
import type { FlowRunRecordsByWorkflowId } from "./run-record.js";
import type { EntityId, EntityUuid, WebId } from "@blockprotocol/type-system";
import type {
  FlowRunRecord,
  FlowRunRecordHeader,
} from "@local/hash-isomorphic-utils/flows/run-record";
import type {
  DetailedFlowField,
  ExternalInputRequest,
  FlowRunWithoutEvents,
  SparseFlowRun,
} from "@local/hash-isomorphic-utils/flows/types";
import type {
  FlowRun,
  FlowRunStatus,
} from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import type { Client as TemporalClient } from "@temporalio/client";

/** A run's detailed fields, from its record. */
export const getFlowRunDetailedFieldsFromRecord = ({
  header,
  events,
}: FlowRunRecord): Pick<FlowRun, DetailedFlowField | "startedAt"> => {
  const runStartedEvent = events.find((event) => event.kind === "runStarted");

  if (!runStartedEvent) {
    throw new Error("No workflow inputs found");
  }

  return {
    flowInputs: runStartedEvent.flowInputs,
    dataSources: header.dataSources,
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
  /** The open input requests saved on the run's entity */
  openInputRequests: ExternalInputRequest[];
  webId: WebId;
};

const toSparseFlowRun = (
  {
    flowDefinitionEntityId,
    flowRunEntityId,
    flowScheduleId,
    name,
    openInputRequests,
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
  openInputRequests,
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
  /** Storage provider for reading the run's record */
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
    ...getFlowRunDetailedFieldsFromRecord(record),
  };
};
