import { WorkflowNotFoundError } from "@temporalio/client";
import proto from "@temporalio/proto";

import { findRunFinishedEvent } from "@local/hash-isomorphic-utils/flows/run-events";
import {
  parseFlowRunRecord,
  serializeFlowRunRecord,
} from "@local/hash-isomorphic-utils/flows/run-record";

import { getFlowRunRecordStorageKey } from "../file-storage.js";
import { parseHistoryItemPayload } from "../temporal/parse-history-item-payload.js";
import {
  buildFlowRunEvents,
  getRunFinishedEvent,
} from "./run-events/build-flow-run-events.js";
import { readFlowRunHistoryEvents } from "./run-events/get-flow-run-history.js";

import type { FileStorageProvider } from "../file-storage.js";
import type { FlowRunRecord } from "@local/hash-isomorphic-utils/flows/run-record";
import type {
  FlowRunEnding,
  RunFlowWorkflowParams,
} from "@local/hash-isomorphic-utils/flows/temporal-types";
import type { FlowRunStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import type {
  Client as TemporalClient,
  WorkflowExecutionDescription,
  WorkflowExecutionStatusName,
} from "@temporalio/client";

type IHistoryEvent = proto.temporal.api.history.v1.IHistoryEvent;

const { EventType } = proto.temporal.api.enums.v1;

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

const findHistoryEvent = (
  history: IHistoryEvent[],
  eventType: proto.temporal.api.enums.v1.EventType,
) => history.find((event) => event.eventType === eventType);

/** A run's record, from its Temporal description and history. */
export const getFlowRunRecordFromHistory = (
  { describe, history, originalRunStartTime }: FlowRunHistoryRecord,
  { workflowId }: { workflowId: string },
): FlowRunRecord => {
  const events = buildFlowRunEvents(history);

  /* `runFlow` takes one argument: its params. */
  const [workflowParams] =
    (parseHistoryItemPayload(
      findHistoryEvent(history, EventType.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED)
        ?.workflowExecutionStartedEventAttributes?.input,
    ) as [RunFlowWorkflowParams] | undefined) ?? [];

  if (!workflowParams) {
    throw new Error("No workflow inputs found");
  }

  return {
    header: {
      workflowId,
      runId: describe.runId,
      status:
        findRunFinishedEvent(events)?.status ??
        (describe.status as FlowRunStatus),
      startedAt: describe.startTime,
      ...(originalRunStartTime
        ? { firstRunStartedAt: originalRunStartTime }
        : {}),
      ...(describe.closeTime ? { closedAt: describe.closeTime } : {}),
      ...("dataSources" in workflowParams
        ? { dataSources: workflowParams.dataSources }
        : {}),
    },
    events,
  };
};

/**
 * The record of a run that is about to end as `ending`, from its record while still running. Its history doesn't yet
 * have the event that closes it, so the event for how it ended is placed after the last event in its history.
 */
const endFlowRunRecord = ({
  record: { header, events },
  ending,
  endedAt,
  lastHistoryEventId,
}: {
  record: FlowRunRecord;
  ending: FlowRunEnding;
  endedAt: string;
  lastHistoryEventId: number;
}): FlowRunRecord => {
  const runFinishedEvent = getRunFinishedEvent(ending);

  return {
    header: { ...header, status: runFinishedEvent.status, closedAt: endedAt },
    events: [
      ...events,
      {
        ...runFinishedEvent,
        position: `${lastHistoryEventId + 1}.0`,
        occurredAt: endedAt,
      },
    ],
  };
};

/** A run's description and the whole history of its current run, from Temporal. */
const readFlowRunHistoryRecord = async ({
  temporalClient,
  workflow,
}: {
  temporalClient: TemporalClient;
  workflow: WorkflowExecutionDescription;
}): Promise<FlowRunHistoryRecord> => {
  const { workflowId, runId } = workflow;

  const history = await readFlowRunHistoryEvents({
    temporalClient,
    workflowId,
    runId,
  });

  /**
   * If this workflow run has been started after the original was reset or 'continue-as-new'd,
   * its start time will be the point at which it was reset/continued.
   * We can check if it has a different firstExecutionRunId and if so, get the start time of the original run.
   */
  let originalRunStartTime: string | undefined;
  const firstExecutionRunId = findHistoryEvent(
    history,
    EventType.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED,
  )?.workflowExecutionStartedEventAttributes?.firstExecutionRunId;

  if (firstExecutionRunId && firstExecutionRunId !== runId) {
    try {
      const originalRun = await temporalClient.workflow
        .getHandle(workflowId, firstExecutionRunId)
        .describe();

      originalRunStartTime = originalRun.startTime.toISOString();
    } catch {
      /* The original run is no longer retained by Temporal. */
      // eslint-disable-next-line no-console
      console.warn(
        `Could not find original run with id ${firstExecutionRunId} for workflow ${workflowId}`,
      );
    }
  }

  return {
    describe: {
      runId,
      status: workflow.status.name,
      startTime: workflow.startTime.toISOString(),
      closeTime: workflow.closeTime?.toISOString(),
    },
    history,
    originalRunStartTime,
  };
};

const writeFlowRunRecord = ({
  storageProvider,
  record,
}: {
  storageProvider: FileStorageProvider;
  record: FlowRunRecord;
}) =>
  storageProvider.uploadDirect({
    key: getFlowRunRecordStorageKey(record.header.workflowId),
    body: serializeFlowRunRecord(record),
    contentType: "application/jsonl",
  });

/** The record a run wrote when it ended, if it has one, and it was written since `writtenSince`. */
export const readStoredFlowRunRecord = async ({
  storageProvider,
  workflowId,
  writtenSince,
}: {
  storageProvider: FileStorageProvider;
  workflowId: string;
  writtenSince?: Date;
}): Promise<FlowRunRecord | null> => {
  const key = getFlowRunRecordStorageKey(workflowId);
  const lastModified = await storageProvider.getObjectLastModified({ key });

  if (!lastModified || (writtenSince && lastModified < writtenSince)) {
    return null;
  }

  const contents = await storageProvider.downloadDirect({ key });

  return parseFlowRunRecord(contents.toString("utf8"));
};

/**
 * Writes the record of the run `runId` of a workflow, which is about to end as `ending`. Called by the run's workflow
 * as the last thing it does, so the run's history is complete apart from the event that closes it. Writes and returns
 * nothing if the workflow's current run is another one, e.g. because the run has been reset.
 */
export const recordEndedFlowRun = async ({
  temporalClient,
  storageProvider,
  workflowId,
  runId,
  ending,
}: {
  temporalClient: TemporalClient;
  storageProvider: FileStorageProvider;
  workflowId: string;
  runId: string;
  ending: FlowRunEnding;
}): Promise<FlowRunRecord | null> => {
  const workflow = await temporalClient.workflow
    .getHandle(workflowId)
    .describe();

  if (workflow.runId !== runId) {
    // eslint-disable-next-line no-console
    console.warn(
      `Not recording run ${runId} of flow ${workflowId}, because its current run is ${workflow.runId}`,
    );
    return null;
  }

  const historyRecord = await readFlowRunHistoryRecord({
    temporalClient,
    workflow,
  });
  const record = endFlowRunRecord({
    record: getFlowRunRecordFromHistory(historyRecord, { workflowId }),
    ending,
    endedAt: new Date().toISOString(),
    lastHistoryEventId: Number(historyRecord.history.at(-1)?.eventId ?? 0),
  });

  await writeFlowRunRecord({ storageProvider, record });

  return record;
};

export class FlowRunRecordNotFoundError extends Error {
  constructor(workflowId: string) {
    super(
      `Flow run ${workflowId} is no longer in Temporal, and has no stored record`,
    );
    this.name = "FlowRunRecordNotFoundError";
  }
}

/**
 * Records being read or already read, by workflow id, so the fields of one GraphQL request read each run once. Create
 * one per request: a running run's record goes stale as the run goes on.
 */
export type FlowRunRecordsByWorkflowId = Map<string, Promise<FlowRunRecord>>;

/**
 * A run's record: the one it wrote when it ended, or else built from its history in Temporal. A run that is still
 * running is read from Temporal, which has its latest events. A run that closed without writing its record, e.g.
 * because it was terminated, has it written now.
 */
const readFlowRunRecord = async ({
  temporalClient,
  storageProvider,
  workflowId,
}: {
  temporalClient: TemporalClient;
  storageProvider: FileStorageProvider;
  workflowId: string;
}): Promise<FlowRunRecord> => {
  let workflow: WorkflowExecutionDescription;

  try {
    workflow = await temporalClient.workflow.getHandle(workflowId).describe();
  } catch (error) {
    if (!(error instanceof WorkflowNotFoundError)) {
      throw error;
    }

    const storedRecord = await readStoredFlowRunRecord({
      storageProvider,
      workflowId,
    });

    if (!storedRecord) {
      throw new FlowRunRecordNotFoundError(workflowId);
    }

    return storedRecord;
  }

  if (!workflow.closeTime) {
    /*
     * A run writes its record, and saves how it ended on its entity, just before its workflow closes: so a run whose
     * entity says it has ended has its ending read from that record until then.
     */
    const recordOfEndingRun = await readStoredFlowRunRecord({
      storageProvider,
      workflowId,
      writtenSince: workflow.startTime,
    });

    if (recordOfEndingRun?.header.runId === workflow.runId) {
      return recordOfEndingRun;
    }

    return getFlowRunRecordFromHistory(
      await readFlowRunHistoryRecord({ temporalClient, workflow }),
      { workflowId },
    );
  }

  const storedRecord = await readStoredFlowRunRecord({
    storageProvider,
    workflowId,
  });

  /*
   * A record from another run of the workflow is from before the run was reset. One with another status was written
   * by a run that was then terminated before it could close.
   */
  if (
    storedRecord?.header.runId === workflow.runId &&
    storedRecord.header.status === (workflow.status.name as FlowRunStatus)
  ) {
    return storedRecord;
  }

  const record = getFlowRunRecordFromHistory(
    await readFlowRunHistoryRecord({ temporalClient, workflow }),
    { workflowId },
  );

  try {
    await writeFlowRunRecord({ storageProvider, record });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      `Could not write the record of closed flow run ${workflowId}: ${(error as Error).message}`,
    );
  }

  return record;
};

export const getFlowRunRecord = ({
  recordsByWorkflowId,
  ...params
}: {
  temporalClient: TemporalClient;
  storageProvider: FileStorageProvider;
  workflowId: string;
  recordsByWorkflowId?: FlowRunRecordsByWorkflowId;
}): Promise<FlowRunRecord> => {
  const existingRecord = recordsByWorkflowId?.get(params.workflowId);

  if (existingRecord) {
    return existingRecord;
  }

  const record = readFlowRunRecord(params);

  recordsByWorkflowId?.set(params.workflowId, record);

  return record;
};
