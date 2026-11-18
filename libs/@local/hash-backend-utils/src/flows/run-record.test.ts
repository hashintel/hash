import { readdirSync, readFileSync } from "node:fs";

import { WorkflowNotFoundError } from "@temporalio/client";
import proto from "@temporalio/proto";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  toStepErrors,
  unknownErrorMessage,
} from "@local/hash-isomorphic-utils/flows/run-events";
import {
  parseFlowRunRecord,
  serializeFlowRunRecord,
} from "@local/hash-isomorphic-utils/flows/run-record";
import { FlowRunStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

import { getFlowRunRecordStorageKey } from "../file-storage.js";
import { parseHistoryItemPayload } from "../temporal/parse-history-item-payload.js";
import { createRunningFlowRunHistoryCache } from "./run-events/running-flow-run-history-cache.js";
import {
  getFlowRunRecord,
  getFlowRunRecordFromHistory,
  getStoredFlowRunRecordKey,
  recordEndedFlowRun,
} from "./run-record.js";

import type { FileStorageProvider } from "../file-storage.js";
import type { FlowRunHistoryRecord } from "./run-record.js";
import type { FlowRunRecord } from "@local/hash-isomorphic-utils/flows/run-record";
import type {
  FlowRunEnding,
  RunFlowWorkflowResponse,
} from "@local/hash-isomorphic-utils/flows/temporal-types";
import type { Client as TemporalClient } from "@temporalio/client";

const workflowId = "workflow-id";

const fixturesUrl = new URL(
  "../../tests/fixtures/flow-run-histories/",
  import.meta.url,
);

const loadFixture = (fixtureName: string): FlowRunHistoryRecord => {
  const { history, ...fixture } = JSON.parse(
    readFileSync(new URL(`${fixtureName}.json`, fixturesUrl), "utf8"),
  ) as Omit<FlowRunHistoryRecord, "history"> & {
    history: Record<string, unknown>;
  };

  return {
    ...fixture,
    history: proto.temporal.api.history.v1.History.fromObject(history).events,
  };
};

/** A Temporal client whose workflow is described as `fixture` describes it when called, or isn't found. */
const createTemporalClient = (fixture: FlowRunHistoryRecord | "notFound") => {
  const describeWorkflow = vi.fn(() =>
    fixture === "notFound"
      ? Promise.reject(
          new WorkflowNotFoundError("Not found", workflowId, undefined),
        )
      : Promise.resolve({
          workflowId,
          runId: fixture.describe.runId,
          status: { name: fixture.describe.status },
          startTime: new Date(fixture.describe.startTime),
          closeTime: fixture.describe.closeTime
            ? new Date(fixture.describe.closeTime)
            : undefined,
          historyLength: Number(fixture.history.at(-1)?.eventId ?? 0),
        }),
  );

  const getWorkflowExecutionHistory = vi.fn(() =>
    Promise.resolve({
      history: { events: fixture === "notFound" ? [] : fixture.history },
      nextPageToken: new Uint8Array(),
    }),
  );

  /* Newest first, three events a page. */
  const getWorkflowExecutionHistoryReverse = vi.fn(
    ({ nextPageToken }: { nextPageToken?: Uint8Array }) => {
      const newestFirst =
        fixture === "notFound" ? [] : fixture.history.toReversed();
      const start = nextPageToken
        ? Number(Buffer.from(nextPageToken).toString())
        : 0;
      const end = start + 3;

      return Promise.resolve({
        history: { events: newestFirst.slice(start, end) },
        nextPageToken:
          end < newestFirst.length
            ? Buffer.from(String(end))
            : new Uint8Array(),
      });
    },
  );

  return {
    temporalClient: {
      workflow: { getHandle: () => ({ describe: describeWorkflow }) },
      workflowService: {
        getWorkflowExecutionHistory,
        getWorkflowExecutionHistoryReverse,
      },
    } as unknown as TemporalClient,
    describeWorkflow,
    getWorkflowExecutionHistory,
    getWorkflowExecutionHistoryReverse,
  };
};

const createStorageProvider = (storedRecord?: FlowRunRecord) => {
  const objects = new Map<string, string>(
    storedRecord
      ? [
          [
            getFlowRunRecordStorageKey(workflowId),
            serializeFlowRunRecord(storedRecord),
          ],
        ]
      : [],
  );

  const downloadDirect = vi.fn(({ key }: { key: string }) =>
    Promise.resolve(Buffer.from(objects.get(key) ?? "")),
  );

  return {
    storageProvider: {
      uploadDirect: ({ key, body }: { key: string; body: string }) => {
        objects.set(key, body);
        return Promise.resolve();
      },
      downloadDirect,
      readFirstLine: ({ key }: { key: string }) =>
        Promise.resolve(objects.get(key)?.split("\n")[0] ?? null),
      getObjectLastModified: ({ key }: { key: string }) =>
        Promise.resolve(objects.has(key) ? new Date() : null),
    } as unknown as FileStorageProvider,
    downloadDirect,
    readStoredRecord: () => {
      const contents = objects.get(getFlowRunRecordStorageKey(workflowId));
      return contents === undefined ? undefined : parseFlowRunRecord(contents);
    },
  };
};

describe("getFlowRunRecord", () => {
  it("reads a running run from Temporal, without storing it", async () => {
    const fixture = loadFixture("in-progress");
    const { temporalClient } = createTemporalClient(fixture);
    const { storageProvider, readStoredRecord } = createStorageProvider();

    const record = await getFlowRunRecord({
      temporalClient,
      storageProvider,
      workflowId,
    });

    expect(record).toStrictEqual(
      getFlowRunRecordFromHistory(fixture, { workflowId }),
    );
    expect(readStoredRecord()).toBeUndefined();
  });

  it("reads the record a run wrote as it ended, before its workflow closes", async () => {
    const fixture = loadFixture("succeeds");
    const { temporalClient, getWorkflowExecutionHistory } =
      createTemporalClient({
        ...fixture,
        describe: { ...fixture.describe, status: "RUNNING", closeTime: null },
      });
    const storedRecord = getFlowRunRecordFromHistory(fixture, { workflowId });
    const { storageProvider } = createStorageProvider(storedRecord);

    await expect(
      getFlowRunRecord({ temporalClient, storageProvider, workflowId }),
    ).resolves.toStrictEqual(storedRecord);
    expect(getWorkflowExecutionHistory).not.toHaveBeenCalled();
  });

  it("reads a running run from Temporal when its stored record is from before it was reset", async () => {
    const fixture = loadFixture("in-progress");
    const { temporalClient } = createTemporalClient(fixture);
    const recordFromBeforeReset = getFlowRunRecordFromHistory(
      loadFixture("succeeds"),
      { workflowId },
    );
    recordFromBeforeReset.header.runId = "run-before-reset";
    const { storageProvider } = createStorageProvider(recordFromBeforeReset);

    await expect(
      getFlowRunRecord({ temporalClient, storageProvider, workflowId }),
    ).resolves.toStrictEqual(
      getFlowRunRecordFromHistory(fixture, { workflowId }),
    );
  });

  it("reads a closed run from its stored record", async () => {
    const fixture = loadFixture("succeeds");
    const { temporalClient, getWorkflowExecutionHistory } =
      createTemporalClient(fixture);
    const storedRecord = getFlowRunRecordFromHistory(fixture, { workflowId });
    const { storageProvider } = createStorageProvider(storedRecord);

    const record = await getFlowRunRecord({
      temporalClient,
      storageProvider,
      workflowId,
    });

    expect(record).toStrictEqual(storedRecord);
    expect(getWorkflowExecutionHistory).not.toHaveBeenCalled();
  });

  it("stores the record of a closed run that has none", async () => {
    const fixture = loadFixture("succeeds");
    const { temporalClient } = createTemporalClient(fixture);
    const { storageProvider, readStoredRecord } = createStorageProvider();

    const record = await getFlowRunRecord({
      temporalClient,
      storageProvider,
      workflowId,
    });

    expect(record).toStrictEqual(
      getFlowRunRecordFromHistory(fixture, { workflowId }),
    );
    expect(readStoredRecord()).toStrictEqual(record);
  });

  it("replaces the stored record of a run from before it was reset", async () => {
    const fixture = loadFixture("succeeds");
    const { temporalClient, getWorkflowExecutionHistory } =
      createTemporalClient(fixture);
    const recordFromBeforeReset = getFlowRunRecordFromHistory(fixture, {
      workflowId,
    });
    recordFromBeforeReset.header.runId = "run-before-reset";
    const { storageProvider, readStoredRecord } = createStorageProvider(
      recordFromBeforeReset,
    );

    const record = await getFlowRunRecord({
      temporalClient,
      storageProvider,
      workflowId,
    });

    expect(getWorkflowExecutionHistory).toHaveBeenCalled();
    expect(record.header.runId).toBe(fixture.describe.runId);
    expect(readStoredRecord()).toStrictEqual(record);
  });

  it("replaces the stored record of a run terminated after writing it", async () => {
    const fixture = loadFixture("reset-base-run");
    const { temporalClient } = createTemporalClient(fixture);
    const recordBeforeTermination = getFlowRunRecordFromHistory(fixture, {
      workflowId,
    });
    recordBeforeTermination.header.status = FlowRunStatus.Completed;
    const { storageProvider, readStoredRecord } = createStorageProvider(
      recordBeforeTermination,
    );

    const record = await getFlowRunRecord({
      temporalClient,
      storageProvider,
      workflowId,
    });

    expect(record.header.status).toBe(FlowRunStatus.Terminated);
    expect(readStoredRecord()).toStrictEqual(record);
  });

  it("reads a run Temporal no longer has from its stored record", async () => {
    const storedRecord = getFlowRunRecordFromHistory(loadFixture("succeeds"), {
      workflowId,
    });
    const { temporalClient } = createTemporalClient("notFound");
    const { storageProvider } = createStorageProvider(storedRecord);

    await expect(
      getFlowRunRecord({ temporalClient, storageProvider, workflowId }),
    ).resolves.toStrictEqual(storedRecord);
  });

  it("can't read a run Temporal no longer has without a stored record", async () => {
    const { temporalClient } = createTemporalClient("notFound");
    const { storageProvider } = createStorageProvider();

    await expect(
      getFlowRunRecord({ temporalClient, storageProvider, workflowId }),
    ).rejects.toThrow("no longer in Temporal");
  });

  it("reads each run once per cache", async () => {
    const fixture = loadFixture("in-progress");
    const { temporalClient, describeWorkflow } = createTemporalClient(fixture);
    const { storageProvider } = createStorageProvider();
    const recordsByWorkflowId = new Map();

    const [first, second] = await Promise.all([
      getFlowRunRecord({
        temporalClient,
        storageProvider,
        workflowId,
        recordsByWorkflowId,
      }),
      getFlowRunRecord({
        temporalClient,
        storageProvider,
        workflowId,
        recordsByWorkflowId,
      }),
    ]);

    expect(second).toBe(first);
    expect(describeWorkflow).toHaveBeenCalledTimes(1);
  });
});

describe("getStoredFlowRunRecordKey", () => {
  const key = getFlowRunRecordStorageKey(workflowId);

  it("has no key for a running run, without reading its history", async () => {
    const { temporalClient, getWorkflowExecutionHistory } =
      createTemporalClient(loadFixture("in-progress"));
    const { storageProvider, readStoredRecord } = createStorageProvider();

    await expect(
      getStoredFlowRunRecordKey({
        temporalClient,
        storageProvider,
        workflowId,
      }),
    ).resolves.toBeNull();
    expect(getWorkflowExecutionHistory).not.toHaveBeenCalled();
    expect(readStoredRecord()).toBeUndefined();
  });

  it("gives the key of the record a run wrote as it ended, before its workflow closes", async () => {
    const fixture = loadFixture("succeeds");
    const { temporalClient } = createTemporalClient({
      ...fixture,
      describe: { ...fixture.describe, status: "RUNNING", closeTime: null },
    });
    const { storageProvider } = createStorageProvider(
      getFlowRunRecordFromHistory(fixture, { workflowId }),
    );

    await expect(
      getStoredFlowRunRecordKey({
        temporalClient,
        storageProvider,
        workflowId,
      }),
    ).resolves.toBe(key);
  });

  it("gives the key of a closed run's stored record without downloading it", async () => {
    const fixture = loadFixture("succeeds");
    const { temporalClient } = createTemporalClient(fixture);
    const { storageProvider, downloadDirect } = createStorageProvider(
      getFlowRunRecordFromHistory(fixture, { workflowId }),
    );

    await expect(
      getStoredFlowRunRecordKey({
        temporalClient,
        storageProvider,
        workflowId,
      }),
    ).resolves.toBe(key);
    expect(downloadDirect).not.toHaveBeenCalled();
  });

  it("stores the record of a closed run that has none, and gives its key", async () => {
    const fixture = loadFixture("succeeds");
    const { temporalClient } = createTemporalClient(fixture);
    const { storageProvider, readStoredRecord } = createStorageProvider();

    await expect(
      getStoredFlowRunRecordKey({
        temporalClient,
        storageProvider,
        workflowId,
      }),
    ).resolves.toBe(key);
    expect(readStoredRecord()).toStrictEqual(
      getFlowRunRecordFromHistory(fixture, { workflowId }),
    );
  });

  it("can't give a key for a closed run whose record can't be stored", async () => {
    const { temporalClient } = createTemporalClient(loadFixture("succeeds"));
    const { storageProvider } = createStorageProvider();
    storageProvider.uploadDirect = () => Promise.reject(new Error("No access"));

    await expect(
      getStoredFlowRunRecordKey({
        temporalClient,
        storageProvider,
        workflowId,
      }),
    ).rejects.toThrow("Could not store the record");
  });

  it("gives the key of a run Temporal no longer has, if it has a stored record", async () => {
    const { temporalClient } = createTemporalClient("notFound");
    const { storageProvider } = createStorageProvider(
      getFlowRunRecordFromHistory(loadFixture("succeeds"), { workflowId }),
    );

    await expect(
      getStoredFlowRunRecordKey({
        temporalClient,
        storageProvider,
        workflowId,
      }),
    ).resolves.toBe(key);
  });
});

describe("getFlowRunRecord with a cache of running runs' histories", () => {
  /** The in-progress run without its last four events, and a way to read it through one cache. */
  const setUp = () => {
    const fullHistory = loadFixture("in-progress");
    const fixture = {
      ...fullHistory,
      history: fullHistory.history.slice(0, -4),
    };
    const temporal = createTemporalClient(fixture);
    const { storageProvider } = createStorageProvider();
    const runningHistories = createRunningFlowRunHistoryCache();
    const deleteHistory = vi.spyOn(runningHistories, "delete");

    return {
      ...temporal,
      deleteHistory,
      fixture,
      storageProvider,
      addLastEvents: () => {
        fixture.history = fullHistory.history;
      },
      read: () =>
        getFlowRunRecord({
          temporalClient: temporal.temporalClient,
          storageProvider,
          workflowId,
          runningHistories,
        }),
    };
  };

  it("reads only the events a run has added since it was last read", async () => {
    const {
      fixture,
      addLastEvents,
      read,
      getWorkflowExecutionHistory,
      getWorkflowExecutionHistoryReverse,
    } = setUp();

    await read();
    await read();
    expect(getWorkflowExecutionHistoryReverse).not.toHaveBeenCalled();

    addLastEvents();
    const record = await read();

    expect(record).toStrictEqual(
      getFlowRunRecordFromHistory(fixture, { workflowId }),
    );
    expect(getWorkflowExecutionHistory).toHaveBeenCalledTimes(1);
    /* Three events a page: the four new ones, then the last one already read. */
    expect(getWorkflowExecutionHistoryReverse).toHaveBeenCalledTimes(2);
  });

  it("reads a run's new events once for requests made at the same time", async () => {
    const { fixture, addLastEvents, read, getWorkflowExecutionHistoryReverse } =
      setUp();

    await read();
    addLastEvents();
    const records = await Promise.all([read(), read(), read()]);

    for (const record of records) {
      expect(record).toStrictEqual(
        getFlowRunRecordFromHistory(fixture, { workflowId }),
      );
    }
    expect(getWorkflowExecutionHistoryReverse).toHaveBeenCalledTimes(2);
  });

  it("reads the whole history of a run that has been reset", async () => {
    const { fixture, addLastEvents, read, getWorkflowExecutionHistory } =
      setUp();

    await read();
    fixture.describe = { ...fixture.describe, runId: "run-after-reset" };
    addLastEvents();
    const record = await read();

    expect(record).toStrictEqual(
      getFlowRunRecordFromHistory(fixture, { workflowId }),
    );
    expect(getWorkflowExecutionHistory).toHaveBeenCalledTimes(2);
  });

  it("drops a run's history once it has closed", async () => {
    const { deleteHistory, fixture, read } = setUp();

    await read();
    expect(deleteHistory).not.toHaveBeenCalled();

    fixture.describe = {
      ...fixture.describe,
      status: "TERMINATED",
      closeTime: new Date().toISOString(),
    };
    await read();

    expect(deleteHistory).toHaveBeenCalledWith(workflowId);
  });

  it("drops a run's history once it has stored its ending, before it closes", async () => {
    const { deleteHistory, read, storageProvider } = setUp();

    const recordOfEndingRun = await read();
    await storageProvider.uploadDirect({
      key: getFlowRunRecordStorageKey(workflowId),
      body: serializeFlowRunRecord(recordOfEndingRun),
    });

    expect(await read()).toStrictEqual(recordOfEndingRun);
    expect(deleteHistory).toHaveBeenCalledWith(workflowId);
  });
});

const { EventType } = proto.temporal.api.enums.v1;

/** How a run ended, as its workflow gives it to the record activity, from the event that closed the run. */
const getRecordedEnding = (
  closeEvent: proto.temporal.api.history.v1.IHistoryEvent,
): FlowRunEnding | null => {
  switch (closeEvent.eventType) {
    case EventType.EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED: {
      const [{ contents }] = parseHistoryItemPayload(
        closeEvent.workflowExecutionCompletedEventAttributes?.result,
      ) as [RunFlowWorkflowResponse];
      const { outputs, stepErrors } = contents[0] ?? {};

      return {
        kind: "completed",
        flowOutputs: outputs ?? [],
        ...(stepErrors ? { stepErrors: toStepErrors(stepErrors) } : {}),
      };
    }
    case EventType.EVENT_TYPE_WORKFLOW_EXECUTION_FAILED: {
      const failure =
        closeEvent.workflowExecutionFailedEventAttributes?.failure;
      const [details] =
        (parseHistoryItemPayload(failure?.applicationFailureInfo?.details) as
          | Partial<RunFlowWorkflowResponse>[]
          | undefined) ?? [];
      const stepErrors = details?.contents?.[0]?.stepErrors;

      return {
        kind: "failed",
        failure: {
          message: failure?.message ?? unknownErrorMessage,
          ...(details?.code ? { code: details.code } : {}),
        },
        ...(stepErrors ? { stepErrors: toStepErrors(stepErrors) } : {}),
      };
    }
    case EventType.EVENT_TYPE_WORKFLOW_EXECUTION_CANCELED:
      return { kind: "cancelled" };
    default:
      return null;
  }
};

describe("recordEndedFlowRun", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const closedFixtures = readdirSync(fixturesUrl)
    .filter((fileName) => fileName.endsWith(".json"))
    .flatMap((fileName) => {
      const fixtureName = fileName.replace(/\.json$/, "");
      const fixture = loadFixture(fixtureName);
      const closeEvent = fixture.history.at(-1);
      const ending = closeEvent ? getRecordedEnding(closeEvent) : null;

      return ending ? [{ fixtureName, fixture, ending }] : [];
    });

  /*
   * The event for how the run ended is placed right after the last event in its history, but Temporal writes more
   * before the event that closes it, and the fixtures leave out workflow task events: so only its position differs.
   */
  it.each(closedFixtures)(
    "stores the record of $fixtureName as it ends as it is read after it closed, apart from where it ended",
    async ({ fixture, ending }) => {
      const historyBeforeClose = fixture.history.slice(0, -1);
      const lastHistoryEventId = Number(historyBeforeClose.at(-1)?.eventId);
      const { temporalClient } = createTemporalClient({
        ...fixture,
        describe: { ...fixture.describe, status: "RUNNING", closeTime: null },
        history: historyBeforeClose,
      });
      const { storageProvider, readStoredRecord } = createStorageProvider();
      vi.useFakeTimers({ now: new Date(fixture.describe.closeTime!) });

      await recordEndedFlowRun({
        temporalClient,
        storageProvider,
        workflowId,
        runId: fixture.describe.runId,
        ending,
      });

      const recordAfterClose = getFlowRunRecordFromHistory(fixture, {
        workflowId,
      });
      const { header, events } = readStoredRecord()!;

      expect({
        header,
        events: [
          ...events.slice(0, -1),
          {
            ...events.at(-1)!,
            position: recordAfterClose.events.at(-1)!.position,
          },
        ],
      }).toStrictEqual(recordAfterClose);
      expect(events.at(-1)?.position).toBe(`${lastHistoryEventId + 1}.0`);
    },
  );

  it("doesn't store the record of a run that has been reset", async () => {
    const fixture = loadFixture("in-progress");
    const { temporalClient } = createTemporalClient(fixture);
    const { storageProvider, readStoredRecord } = createStorageProvider();

    await recordEndedFlowRun({
      temporalClient,
      storageProvider,
      workflowId,
      runId: "run-before-reset",
      ending: { kind: "cancelled" },
    });

    expect(readStoredRecord()).toBeUndefined();
  });
});
