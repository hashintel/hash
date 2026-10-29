import { WorkflowNotFoundError } from "@temporalio/client";
import proto from "@temporalio/proto";

import { findRunFinishedEvent } from "@local/hash-isomorphic-utils/flows/run-events";
import {
  parseFlowRunRecord,
  parseFlowRunRecordHeader,
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
import type { RunningFlowRunHistoryCache } from "./run-events/running-flow-run-history-cache.js";
import type {
  FlowRunRecord,
  FlowRunRecordHeader,
} from "@local/hash-isomorphic-utils/flows/run-record";
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
};

const findHistoryEvent = (
  history: IHistoryEvent[],
  eventType: proto.temporal.api.enums.v1.EventType,
) => history.find((event) => event.eventType === eventType);

/** A run's record, from its Temporal description and history. */
export const getFlowRunRecordFromHistory = (
  { describe, history }: FlowRunHistoryRecord,
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

/**
 * A run's description and the whole history of its current run, from Temporal, or from `runningHistories` for a
 * running run.
 */
const readFlowRunHistoryRecord = async ({
  temporalClient,
  workflow,
  runningHistories,
}: {
  temporalClient: TemporalClient;
  workflow: WorkflowExecutionDescription;
  runningHistories?: RunningFlowRunHistoryCache;
}): Promise<FlowRunHistoryRecord> => {
  const { workflowId, runId } = workflow;

  const history = runningHistories
    ? await runningHistories.readHistory({
        temporalClient,
        workflowId,
        runId,
        historyLength: workflow.historyLength,
      })
    : await readFlowRunHistoryEvents({ temporalClient, workflowId, runId });

  return {
    describe: {
      runId,
      status: workflow.status.name,
      startTime: workflow.startTime.toISOString(),
      closeTime: workflow.closeTime?.toISOString(),
    },
    history,
  };
};

/** A run's record, built from its description and the whole history of its current run in Temporal. */
const readFlowRunRecordFromHistory = async ({
  temporalClient,
  workflow,
  runningHistories,
}: {
  temporalClient: TemporalClient;
  workflow: WorkflowExecutionDescription;
  runningHistories?: RunningFlowRunHistoryCache;
}): Promise<FlowRunRecord> =>
  getFlowRunRecordFromHistory(
    await readFlowRunHistoryRecord({
      temporalClient,
      workflow,
      runningHistories,
    }),
    { workflowId: workflow.workflowId },
  );

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

/** The header of the record a run wrote when it ended, if it has one, and it was written since `writtenSince`. */
export const readStoredFlowRunRecordHeader = async ({
  storageProvider,
  workflowId,
  writtenSince,
}: {
  storageProvider: FileStorageProvider;
  workflowId: string;
  writtenSince?: Date;
}): Promise<FlowRunRecordHeader | null> => {
  const key = getFlowRunRecordStorageKey(workflowId);
  const lastModified = await storageProvider.getObjectLastModified({ key });

  if (!lastModified || (writtenSince && lastModified < writtenSince)) {
    return null;
  }

  const firstLine = await storageProvider.readFirstLine({ key });

  return firstLine === null ? null : parseFlowRunRecordHeader(firstLine);
};

const downloadStoredFlowRunRecord = async ({
  storageProvider,
  workflowId,
}: {
  storageProvider: FileStorageProvider;
  workflowId: string;
}): Promise<FlowRunRecord> => {
  const contents = await storageProvider.downloadDirect({
    key: getFlowRunRecordStorageKey(workflowId),
  });

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
 * Whether a run's whole record is the one in storage: `stored` once the run has written it as it ended, `running`
 * until then, and `notStored` for a run that closed without writing it, e.g. because it was terminated.
 */
type CurrentFlowRunRecord =
  | { kind: "stored"; header: FlowRunRecordHeader }
  | { kind: "running"; workflow: WorkflowExecutionDescription }
  | { kind: "notStored"; workflow: WorkflowExecutionDescription };

const getCurrentFlowRunRecord = async ({
  temporalClient,
  storageProvider,
  workflowId,
  runningHistories,
}: {
  temporalClient: TemporalClient;
  storageProvider: FileStorageProvider;
  workflowId: string;
  runningHistories?: RunningFlowRunHistoryCache;
}): Promise<CurrentFlowRunRecord> => {
  let workflow: WorkflowExecutionDescription;

  try {
    workflow = await temporalClient.workflow.getHandle(workflowId).describe();
  } catch (error) {
    if (!(error instanceof WorkflowNotFoundError)) {
      throw error;
    }

    runningHistories?.delete(workflowId);

    const storedHeader = await readStoredFlowRunRecordHeader({
      storageProvider,
      workflowId,
    });

    if (!storedHeader) {
      throw new FlowRunRecordNotFoundError(workflowId);
    }

    return { kind: "stored", header: storedHeader };
  }

  if (!workflow.closeTime) {
    /*
     * A run writes its record, and saves how it ended on its entity, just before its workflow closes: so a run whose
     * entity says it has ended has its ending read from that record until then.
     */
    const headerOfEndingRun = await readStoredFlowRunRecordHeader({
      storageProvider,
      workflowId,
      writtenSince: workflow.startTime,
    });

    if (headerOfEndingRun?.runId === workflow.runId) {
      runningHistories?.delete(workflowId);
      return { kind: "stored", header: headerOfEndingRun };
    }

    return { kind: "running", workflow };
  }

  runningHistories?.delete(workflowId);

  const storedHeader = await readStoredFlowRunRecordHeader({
    storageProvider,
    workflowId,
  });

  /*
   * A record from another run of the workflow is from before the run was reset. One with another status was written
   * by a run that was then terminated before it could close.
   */
  if (
    storedHeader?.runId === workflow.runId &&
    storedHeader.status === (workflow.status.name as FlowRunStatus)
  ) {
    return { kind: "stored", header: storedHeader };
  }

  return { kind: "notStored", workflow };
};

/**
 * A run's record: the one it wrote when it ended, or else built from its history in Temporal. A run that closed
 * without writing its record has it written now.
 */
const readFlowRunRecord = async ({
  temporalClient,
  storageProvider,
  workflowId,
  runningHistories,
}: {
  temporalClient: TemporalClient;
  storageProvider: FileStorageProvider;
  workflowId: string;
  runningHistories?: RunningFlowRunHistoryCache;
}): Promise<FlowRunRecord> => {
  const current = await getCurrentFlowRunRecord({
    temporalClient,
    storageProvider,
    workflowId,
    runningHistories,
  });

  switch (current.kind) {
    case "stored":
      return downloadStoredFlowRunRecord({ storageProvider, workflowId });
    case "running":
      return readFlowRunRecordFromHistory({
        temporalClient,
        workflow: current.workflow,
        runningHistories,
      });
    case "notStored": {
      const record = await readFlowRunRecordFromHistory({
        temporalClient,
        workflow: current.workflow,
      });

      try {
        await writeFlowRunRecord({ storageProvider, record });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(
          `Could not write the record of closed flow run ${workflowId}: ${(error as Error).message}`,
        );
      }

      return record;
    }
  }
};

export const getFlowRunRecord = ({
  recordsByWorkflowId,
  ...params
}: {
  temporalClient: TemporalClient;
  storageProvider: FileStorageProvider;
  workflowId: string;
  recordsByWorkflowId?: FlowRunRecordsByWorkflowId;
  runningHistories?: RunningFlowRunHistoryCache;
}): Promise<FlowRunRecord> => {
  const existingRecord = recordsByWorkflowId?.get(params.workflowId);

  if (existingRecord) {
    return existingRecord;
  }

  const record = readFlowRunRecord(params);

  recordsByWorkflowId?.set(params.workflowId, record);

  return record;
};

/**
 * The storage key of a run's record, once the stored record is its whole record: i.e. once the run has ended. A
 * closed run whose stored record is missing or out of date has it written first. `null` while the run is running,
 * without reading its history.
 */
export const getStoredFlowRunRecordKey = async (params: {
  temporalClient: TemporalClient;
  storageProvider: FileStorageProvider;
  workflowId: string;
}): Promise<string | null> => {
  const current = await getCurrentFlowRunRecord(params);

  if (current.kind === "running") {
    return null;
  }

  if (current.kind === "notStored") {
    const record = await readFlowRunRecordFromHistory({
      temporalClient: params.temporalClient,
      workflow: current.workflow,
    });

    try {
      await writeFlowRunRecord({
        storageProvider: params.storageProvider,
        record,
      });
    } catch (error) {
      throw new Error(
        `Could not store the record of closed flow run ${params.workflowId}`,
        { cause: error },
      );
    }
  }

  return getFlowRunRecordStorageKey(params.workflowId);
};
