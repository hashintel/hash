import { readdirSync, readFileSync } from "node:fs";

import proto from "@temporalio/proto";
import { describe, expect, it } from "vitest";

import {
  parseFlowRunRecord,
  serializeFlowRunRecord,
} from "@local/hash-isomorphic-utils/flows/run-record";
import { FlowStepStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

import { getFlowRunDetailedFieldsFromRecord } from "./get-flow-run-details.js";
import { getFlowRunRecordFromHistory } from "./run-record.js";

import type { FileStorageProvider } from "../file-storage.js";
import type { ResolvePayloadContext } from "./payload-storage.js";
import type { FlowRunHistoryRecord } from "./run-record.js";

const fixturesUrl = new URL(
  "../../tests/fixtures/flow-run-histories/",
  import.meta.url,
);

/**
 * What `getFlowRunDetailedFieldsFromHistory` returned on each fixture when it was split out of the Temporal reader,
 * or `{ throws }` with the message it threw.
 */
const recordedDetailsUrl = new URL(
  "../../tests/fixtures/flow-run-details/",
  import.meta.url,
);

const fixtureNames = readdirSync(fixturesUrl)
  .filter((fileName) => fileName.endsWith(".json"))
  .map((fileName) => fileName.replace(/\.json$/, ""));

/**
 * Resolves every stored payload to its own storage key, so outputs that reference stored payloads resolve
 * deterministically without S3.
 */
const storageProvider = {
  downloadDirect: ({ key }: { key: string }) =>
    Promise.resolve(Buffer.from(JSON.stringify({ storageKey: key }))),
} as unknown as FileStorageProvider;

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

/* The recorder runs each case with its flow run's entity uuid as the workflow id. */
const workflowIdOf = ({ history }: FlowRunHistoryRecord) => {
  const [input] =
    history[0]?.workflowExecutionStartedEventAttributes?.input?.payloads ?? [];

  return (
    JSON.parse(input?.data?.toString() ?? "{}") as {
      flowRunEntityUuid: string;
    }
  ).flowRunEntityUuid;
};

const getFlowRunDetailedFieldsFromHistory = (
  historyRecord: FlowRunHistoryRecord,
  resolvePayloadContext: ResolvePayloadContext,
) =>
  getFlowRunDetailedFieldsFromRecord(
    getFlowRunRecordFromHistory(historyRecord, {
      workflowId: resolvePayloadContext.workflowId,
    }),
    resolvePayloadContext,
  );

type RecordedDetails = {
  steps?: {
    lastFailure?: { message?: string } | null;
    outputs?: { code: string }[] | null;
  }[];
};

/**
 * A run's events keep a step's failure message, but not the rest of Temporal's failure, nor the code of a status
 * that isn't OK, so the recorded details are compared without them.
 */
const withOnlyWhatEventsKeep = (recorded: RecordedDetails): RecordedDetails => {
  for (const step of recorded.steps ?? []) {
    if (step.lastFailure) {
      step.lastFailure = { message: step.lastFailure.message };
    }
    for (const output of step.outputs ?? []) {
      if (output.code !== "OK") {
        output.code = "UNKNOWN";
      }
    }
  }

  return recorded;
};

describe("getFlowRunDetailedFieldsFromHistory", () => {
  it.each(fixtureNames)(
    "returns the recorded details for %s",
    async (fixtureName) => {
      const fixture = loadFixture(fixtureName);

      const details: unknown = await getFlowRunDetailedFieldsFromHistory(
        fixture,
        { storageProvider, workflowId: workflowIdOf(fixture) },
      ).catch((error: unknown) => ({ throws: (error as Error).message }));

      /* Compared as GraphQL sends it: as JSON, without `undefined` fields. */
      expect(JSON.parse(JSON.stringify(details))).toStrictEqual(
        withOnlyWhatEventsKeep(
          JSON.parse(
            readFileSync(
              new URL(`${fixtureName}.json`, recordedDetailsUrl),
              "utf8",
            ),
          ) as RecordedDetails,
        ),
      );
    },
  );

  it("keeps the retry state of a step whose last allowed attempt timed out", async () => {
    const { EventType, RetryState } = proto.temporal.api.enums.v1;
    const fixture = loadFixture("gives-up");

    const details = await getFlowRunDetailedFieldsFromHistory(
      {
        ...fixture,
        history: fixture.history.map((event) => {
          const failed = event.activityTaskFailedEventAttributes;

          return failed
            ? {
                ...event,
                eventType: EventType.EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT,
                activityTaskFailedEventAttributes: null,
                activityTaskTimedOutEventAttributes: {
                  failure: failed.failure,
                  scheduledEventId: failed.scheduledEventId,
                  startedEventId: failed.startedEventId,
                  retryState: RetryState.RETRY_STATE_MAXIMUM_ATTEMPTS_REACHED,
                },
              }
            : event;
        }),
      },
      { storageProvider, workflowId: workflowIdOf(fixture) },
    );

    expect(details.steps).toMatchObject([
      {
        stepId: "firstTwo",
        retryState: String(RetryState.RETRY_STATE_MAXIMUM_ATTEMPTS_REACHED),
      },
    ]);
  });

  it("closes a cancelled run's unfinished steps as cancelled", async () => {
    const fixture = loadFixture("in-progress");
    const closeTime = "2026-10-21T13:36:23.000Z";

    const { steps } = await getFlowRunDetailedFieldsFromHistory(
      {
        ...fixture,
        describe: { ...fixture.describe, status: "CANCELLED", closeTime },
      },
      { storageProvider, workflowId: workflowIdOf(fixture) },
    );

    expect(
      steps.map(({ stepId, status, closedAt }) => ({
        stepId,
        status,
        closedAt,
      })),
    ).toStrictEqual([
      {
        stepId: "research",
        status: FlowStepStatus.Cancelled,
        closedAt: closeTime,
      },
    ]);
  });
});

describe("getFlowRunDetailedFieldsFromRecord", () => {
  it.each(fixtureNames)(
    "returns the same details from the stored record of %s as from its history",
    async (fixtureName) => {
      const fixture = loadFixture(fixtureName);
      const workflowId = workflowIdOf(fixture);
      const resolvePayloadContext = { storageProvider, workflowId };

      const storedRecord = parseFlowRunRecord(
        serializeFlowRunRecord(
          getFlowRunRecordFromHistory(fixture, { workflowId }),
        ),
      );

      expect(
        JSON.parse(
          JSON.stringify(
            await getFlowRunDetailedFieldsFromRecord(
              storedRecord,
              resolvePayloadContext,
            ),
          ),
        ),
      ).toStrictEqual(
        JSON.parse(
          JSON.stringify(
            await getFlowRunDetailedFieldsFromHistory(
              fixture,
              resolvePayloadContext,
            ),
          ),
        ),
      );
    },
  );
});
