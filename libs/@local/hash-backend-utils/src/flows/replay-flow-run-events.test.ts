import { readdirSync, readFileSync } from "node:fs";

import proto from "@temporalio/proto";
import { describe, expect, it } from "vitest";

import { compileFlowDefinition } from "@local/flow-petri-net/compile-flow-definition";
import { replayFlowRunEvents } from "@local/flow-petri-net/replay-flow-run-events";
import { findRunFinishedEvent } from "@local/hash-isomorphic-utils/flows/run-events";
import { generateStepRunId } from "@local/hash-isomorphic-utils/flows/step-run-id";
import { getStepRunsFromEvents } from "@local/hash-isomorphic-utils/flows/step-runs";
import { FlowStepStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

import { parseHistoryItemPayload } from "../temporal/parse-history-item-payload.js";
import { getFlowRunRecordFromHistory } from "./run-record.js";

import type { FlowRunHistoryRecord } from "./run-record.js";
import type { FlowNetMetadata } from "@local/flow-petri-net/flow-net-metadata";
import type {
  FlowNetPosition,
  FlowNetStepRun,
} from "@local/flow-petri-net/interpret-flow-net";
import type { FlowRunReplay } from "@local/flow-petri-net/replay-flow-run-events";
import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";

/*
 * Replays each recorded run's events on the net compiled from the definition it ran, and checks the net agrees with
 * the run's step runs and outputs. The replay assumes what each kind of event means for the net, so a change to how
 * events are built from a history that breaks those assumptions fails here.
 */

const fixturesUrl = new URL(
  "../../tests/fixtures/flow-run-histories/",
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

/* Its step has an input its action doesn't define, so its definition doesn't compile to a net. */
const invalidDefinitionFixtureName = "unknown-step-input";

const replayedFixtureNames = fixtureNames.filter(
  (fixtureName) => fixtureName !== invalidDefinitionFixtureName,
);

const closedFixtureNames = replayedFixtureNames.filter(
  (fixtureName) => loadFixture(fixtureName).describe.status !== "RUNNING",
);

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

/** The definition the run ran, as `getFlowDefinitionActivity` returned it. */
const flowDefinitionOf = ({ history }: FlowRunHistoryRecord) => {
  const scheduledEventId = history.find(
    (event) =>
      event.activityTaskScheduledEventAttributes?.activityType?.name ===
      "getFlowDefinitionActivity",
  )?.eventId;

  const completed = history.find(
    (event) =>
      scheduledEventId &&
      event.activityTaskCompletedEventAttributes?.scheduledEventId?.equals(
        scheduledEventId,
      ),
  )?.activityTaskCompletedEventAttributes;

  const [result] = (parseHistoryItemPayload(completed?.result) ?? []) as [
    { flowDefinition?: FlowDefinition }?,
  ];

  if (!result?.flowDefinition) {
    throw new Error("The history doesn't record the run's flow definition");
  }

  return result.flowDefinition;
};

const stepRunIdOf = ({ stepId, itemPath }: FlowNetStepRun) => {
  const [itemIndex, ...nestedItemIndices] = itemPath;

  if (nestedItemIndices.length > 0) {
    throw new Error(`Step run ${stepId} is inside a nested forEach`);
  }

  return itemIndex === undefined
    ? stepId
    : generateStepRunId(stepId, itemIndex);
};

type NetStepRunStatus = "pending" | "inProgress" | "completed" | "failed";

/**
 * What the net says each action step run did: its last lifecycle firing, and how many attempts it made. A step run
 * with no lifecycle firing is still pending.
 */
const stepRunsFromNet = (replay: FlowRunReplay) => {
  const stepRuns = new Map<
    string,
    {
      stepRun: FlowNetStepRun;
      status: NetStepRunStatus;
      attempts: number;
      componentInstanceId?: string;
    }
  >();

  for (const { role, stepRun, componentInstanceId } of replay.firings) {
    const stepRunId = stepRunIdOf(stepRun);
    const current = stepRuns.get(stepRunId) ?? {
      stepRun,
      status: "pending",
      attempts: 0,
    };

    switch (role) {
      case "startStep":
        stepRuns.set(stepRunId, { ...current, status: "inProgress" });
        break;
      case "startAttempt":
      case "retryAttempt":
        stepRuns.set(stepRunId, {
          ...current,
          status: "inProgress",
          attempts: current.attempts + 1,
          componentInstanceId,
        });
        break;
      case "succeedAttempt":
        stepRuns.set(stepRunId, { ...current, status: "completed" });
        break;
      case "giveUp":
        stepRuns.set(stepRunId, { ...current, status: "failed" });
        break;
      default:
        break;
    }
  }

  return stepRuns;
};

/** The net's status for a step run with each status its run's events give it. */
const netStatusOf = (status: FlowStepStatus): NetStepRunStatus => {
  switch (status) {
    case FlowStepStatus.Completed:
      return "completed";
    case FlowStepStatus.Failed:
    case FlowStepStatus.TimedOut:
      return "failed";
    case FlowStepStatus.Scheduled:
    case FlowStepStatus.Started:
    case FlowStepStatus.InformationRequired:
    case FlowStepStatus.CancelRequested:
      return "inProgress";
    /* The net has no transition for cancelling an attempt, so a cancelled one stays in progress. */
    case FlowStepStatus.Cancelled:
      return "inProgress";
    /* The net has no transition for skipping a step yet, so a skipped one stays pending. */
    case FlowStepStatus.Skipped:
      return "pending";
  }
};

/** Whether a token is at a flow output's endpoint: a place of the root net, or a port of a step's instance. */
const isAt = (
  position: FlowNetPosition,
  endpoint: FlowNetMetadata["flowOutputs"][string],
) =>
  endpoint.kind === "place"
    ? position.kind === "place" && position.placeId === endpoint.placeId
    : position.kind === "instancePlace" &&
      position.componentInstanceId === endpoint.componentInstanceId &&
      position.placeId === endpoint.portPlaceId;

const replayFixture = async (fixtureName: string) => {
  const fixture = loadFixture(fixtureName);
  const workflowId = workflowIdOf(fixture);
  const record = getFlowRunRecordFromHistory(fixture, { workflowId });

  const net = await compileFlowDefinition(flowDefinitionOf(fixture), {
    layout: false,
  });

  return {
    fixture,
    net,
    replay: replayFlowRunEvents(net, record.events),
    stepRuns: getStepRunsFromEvents(record.events, record.header),
    outputNames: (findRunFinishedEvent(record.events)?.flowOutputs ?? []).map(
      ({ outputName }) => outputName,
    ),
  };
};

describe("replayFlowRunEvents on recorded runs", () => {
  it.each(replayedFixtureNames)(
    "follows every event of %s",
    async (fixtureName) => {
      const { replay } = await replayFixture(fixtureName);

      expect(replay.problems).toEqual([]);
    },
  );

  it.each(closedFixtureNames)(
    "waits on nothing once %s has closed",
    async (fixtureName) => {
      const { replay, stepRuns } = await replayFixture(fixtureName);

      /* A cancelled attempt stays in progress, as the net can't cancel it. */
      const cancelledStepRunIds = stepRuns
        .filter(({ status }) => status === FlowStepStatus.Cancelled)
        .map(({ stepId }) => stepId);

      expect(
        replay.held.filter(
          ({ stepRun }) => !cancelledStepRunIds.includes(stepRunIdOf(stepRun)),
        ),
      ).toEqual([]);
    },
  );

  it.each(replayedFixtureNames)(
    "gives each step of %s the status and attempts its events give",
    async (fixtureName) => {
      const { replay, stepRuns } = await replayFixture(fixtureName);
      const fromNet = stepRunsFromNet(replay);
      const fromEvents = new Map(stepRuns.map((step) => [step.stepId, step]));

      const stepRunIds = [
        ...new Set([...fromEvents.keys(), ...fromNet.keys()]),
      ].sort();

      expect(
        stepRunIds.map((stepRunId) => {
          const { status, attempts } = fromNet.get(stepRunId) ?? {
            status: "pending",
            attempts: 0,
          };

          return { stepRunId, status, attempts };
        }),
      ).toEqual(
        stepRunIds.map((stepRunId) => {
          const step = fromEvents.get(stepRunId);

          return {
            stepRunId,
            status: step ? netStatusOf(step.status) : "not in the events",
            attempts: step?.attempt ?? 0,
          };
        }),
      );
    },
  );

  it.each(replayedFixtureNames)(
    "keeps an attempt token only for each step of %s in progress",
    async (fixtureName) => {
      const { replay } = await replayFixture(fixtureName);

      for (const [stepRunId, fromNet] of stepRunsFromNet(replay)) {
        const attemptTokens = replay.marking.filter(
          ({ position, token }) =>
            token.kind === "attempt" &&
            position.kind === "instancePlace" &&
            position.componentInstanceId === fromNet.componentInstanceId &&
            stepRunIdOf({ ...fromNet.stepRun, itemPath: token.itemPath }) ===
              stepRunId,
        );

        expect({ stepRunId, attemptTokens: attemptTokens.length }).toEqual({
          stepRunId,
          attemptTokens: fromNet.status === "inProgress" ? 1 : 0,
        });
      }
    },
  );

  it.each(replayedFixtureNames)(
    "puts each of %s's flow outputs where the net's metadata gives",
    async (fixtureName) => {
      const { net, replay, outputNames } = await replayFixture(fixtureName);
      const { flowOutputs } = net.metadata as unknown as FlowNetMetadata;

      const outputsInNet = outputNames.filter((outputName) => {
        const endpoint = flowOutputs[outputName];

        return replay.marking.some(
          ({ position, token }) =>
            endpoint &&
            isAt(position, endpoint) &&
            token.kind === "value" &&
            token.present,
        );
      });

      expect(outputsInNet).toEqual(outputNames);
    },
  );

  it(`can't compile the definition ${invalidDefinitionFixtureName} ran`, async () => {
    await expect(
      compileFlowDefinition(
        flowDefinitionOf(loadFixture(invalidDefinitionFixtureName)),
        { layout: false },
      ),
    ).rejects.toThrow('Action "takeFirst" has no input "limit"');
  });

  it("lists the skipped steps of a run that skipped them", async () => {
    const { replay } = await replayFixture("skipped");

    expect(replay.skippedStepRuns.map(stepRunIdOf).sort()).toEqual([
      "countKept",
      "keep",
    ]);
  });
});
