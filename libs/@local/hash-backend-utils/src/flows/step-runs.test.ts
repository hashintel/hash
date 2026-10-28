import { readdirSync, readFileSync } from "node:fs";

import proto from "@temporalio/proto";
import { describe, expect, it } from "vitest";

import { getInputRequests } from "@local/hash-isomorphic-utils/flows/run-events";
import {
  parseFlowRunRecord,
  serializeFlowRunRecord,
} from "@local/hash-isomorphic-utils/flows/run-record";
import { getStepRunsFromEvents } from "@local/hash-isomorphic-utils/flows/step-runs";
import { FlowStepStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

import { getFlowRunRecordFromHistory } from "./run-record.js";

import type { FlowRunHistoryRecord } from "./run-record.js";
import type { FlowRunRecord } from "@local/hash-isomorphic-utils/flows/run-record";

const fixturesUrl = new URL(
  "../../tests/fixtures/flow-run-histories/",
  import.meta.url,
);

/** The step runs and input requests each fixture's events give. */
const recordedStepRunsUrl = new URL(
  "../../tests/fixtures/flow-run-step-runs/",
  import.meta.url,
);

const fixtureNames = readdirSync(fixturesUrl)
  .filter((fileName) => fileName.endsWith(".json"))
  .map((fileName) => fileName.replace(/\.json$/, ""));

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

const recordOf = (historyRecord: FlowRunHistoryRecord) =>
  getFlowRunRecordFromHistory(historyRecord, {
    workflowId: workflowIdOf(historyRecord),
  });

/* Compared as they're sent: as JSON, without `undefined` fields. */
const stepRunsAndInputRequestsOf = ({ header, events }: FlowRunRecord) =>
  JSON.parse(
    JSON.stringify({
      stepRuns: getStepRunsFromEvents(events, header),
      inputRequests: getInputRequests(events),
    }),
  ) as unknown;

describe("getStepRunsFromEvents on recorded runs", () => {
  it.each(fixtureNames)(
    "gives the recorded step runs and input requests of %s",
    (fixtureName) => {
      expect(
        stepRunsAndInputRequestsOf(recordOf(loadFixture(fixtureName))),
      ).toStrictEqual(
        JSON.parse(
          readFileSync(
            new URL(`${fixtureName}.json`, recordedStepRunsUrl),
            "utf8",
          ),
        ),
      );
    },
  );

  it.each(fixtureNames)(
    "gives the same from the stored record of %s as from its history",
    (fixtureName) => {
      const record = recordOf(loadFixture(fixtureName));

      expect(
        stepRunsAndInputRequestsOf(
          parseFlowRunRecord(serializeFlowRunRecord(record)),
        ),
      ).toStrictEqual(stepRunsAndInputRequestsOf(record));
    },
  );

  it("gives up a step whose last allowed attempt timed out as out of attempts", () => {
    const { EventType, RetryState } = proto.temporal.api.enums.v1;
    const fixture = loadFixture("gives-up");

    const { header, events } = recordOf({
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
    });

    expect(getStepRunsFromEvents(events, header)).toMatchObject([
      { stepId: "firstTwo", gaveUpReason: "attemptsExhausted" },
    ]);
  });

  it("closes a cancelled run's unfinished steps as cancelled", () => {
    const fixture = loadFixture("in-progress");
    const closeTime = "2026-10-21T13:36:23.000Z";

    const { header, events } = recordOf({
      ...fixture,
      describe: { ...fixture.describe, status: "CANCELLED", closeTime },
    });

    expect(
      getStepRunsFromEvents(events, header).map(
        ({ stepId, status, closedAt }) => ({ stepId, status, closedAt }),
      ),
    ).toStrictEqual([
      {
        stepId: "research",
        status: FlowStepStatus.Cancelled,
        closedAt: closeTime,
      },
    ]);
  });
});
