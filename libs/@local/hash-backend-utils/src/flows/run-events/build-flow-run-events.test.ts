import { readFileSync } from "node:fs";

import proto from "@temporalio/proto";
import { describe, expect, it } from "vitest";

import { FlowRunStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

import { buildFlowRunEvents } from "./build-flow-run-events.js";

import type { ActorEntityUuid } from "@blockprotocol/type-system";
import type { DistributiveOmit } from "@local/advanced-types/distribute";
import type {
  FlowRunEvent,
  FlowRunEventStepRun,
} from "@local/hash-isomorphic-utils/flows/run-events";
import type {
  Payload,
  StepProgressLog,
} from "@local/hash-isomorphic-utils/flows/types";

const loadFixture = (fixtureName: string) => {
  const { describe: description, history } = JSON.parse(
    readFileSync(
      new URL(
        `../../../tests/fixtures/flow-run-histories/${fixtureName}.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  ) as { describe: { runId: string }; history: Record<string, unknown> };

  return {
    runId: description.runId,
    history: proto.temporal.api.history.v1.History.fromObject(history).events,
  };
};

type ExpectedEvent = [
  position: string,
  event: DistributiveOmit<FlowRunEvent, "position" | "occurredAt">,
  /** When it happened, if not when its Temporal event did. */
  occurredAt?: string,
];

const expectEvents = (fixtureName: string, expected: ExpectedEvent[]) => {
  const { history } = loadFixture(fixtureName);

  const timeOf = (position: string) => {
    const eventTime = history.find(
      (event) => event.eventId?.toString() === position.split(".")[0],
    )?.eventTime;

    if (!eventTime?.seconds) {
      throw new Error(`No history event for ${position} in ${fixtureName}`);
    }

    return new Date(
      eventTime.seconds.toNumber() * 1000 + (eventTime.nanos ?? 0) / 1e6,
    ).toISOString();
  };

  expect(buildFlowRunEvents(history)).toStrictEqual(
    expected.map(([position, event, occurredAt]) => ({
      ...event,
      position,
      occurredAt: occurredAt ?? timeOf(position),
    })),
  );
};

const stepRun = (
  stepId: string,
  ...itemPath: number[]
): FlowRunEventStepRun => ({
  stepId,
  itemPath,
});

const numbers = (value: number[]) => ({ kind: "Number" as const, value });
const number = (value: number) => ({ kind: "Number" as const, value });

const firstTwoInputs = [
  { inputName: "items", payload: numbers([3, 1, 4]) },
  { inputName: "count", payload: number(2) },
];

const runStartedWithNumbers: ExpectedEvent = [
  "1.0",
  { kind: "runStarted", flowInputs: { numbers: numbers([3, 1, 4]) } },
];

const research = stepRun("research");

const runStartedWithPrompt: ExpectedEvent = [
  "1.0",
  {
    kind: "runStarted",
    flowInputs: { prompt: { kind: "Text", value: "Who makes HASH?" } },
  },
];

const researchStarted = (position: string): ExpectedEvent => [
  position,
  {
    kind: "stepStarted",
    stepRun: research,
    stepType: "researchEntities",
    inputs: [
      {
        inputName: "prompt",
        payload: { kind: "Text", value: "Who makes HASH?" },
      },
    ],
  },
];

/** The stub returns no proposed entities inline, where a real run stores them. */
const noProposedEntities = {
  kind: "ProposedEntity",
  value: [],
} as unknown as Payload;

const researchSucceeded = (position: string): ExpectedEvent => [
  position,
  {
    kind: "attemptSucceeded",
    stepRun: research,
    attempt: 1,
    outputs: [
      { outputName: "proposedEntities", payload: noProposedEntities },
      {
        outputName: "highlightedEntities",
        payload: { kind: "EntityId", value: [] },
      },
    ],
  },
];

const researchRunCompleted = (position: string): ExpectedEvent => [
  position,
  {
    kind: "runFinished",
    status: FlowRunStatus.Completed,
    flowOutputs: [
      { outputName: "proposedEntities", payload: noProposedEntities },
    ],
    stepErrors: [],
  },
];

const planLog = (
  type: "CreatedPlan" | "UpdatedPlan",
  plan: string,
  recordedAt: string,
): StepProgressLog => ({
  type,
  plan,
  stepId: "research",
  recordedAt,
  workerType: "Coordinator",
  workerInstanceId: "coordinator",
  parentInstanceId: null,
  toolCallId: null,
});

const missingFirstTwoMessage =
  "Error processing output definition 'firstTwo': step 'firstTwo' did not produce its required output 'items'";

const inProgressEvents: ExpectedEvent[] = [
  runStartedWithPrompt,
  researchStarted("35.0"),
  [
    "36.0",
    {
      kind: "progressLogged",
      stepRun: research,
      loggedInAttempt: 1,
      log: planLog("CreatedPlan", "Search the web", "2026-10-21T13:36:21.332Z"),
    },
  ],
];

const checkpointLog: ExpectedEvent = [
  "36.0",
  {
    kind: "progressLogged",
    stepRun: research,
    log: {
      type: "ResearchActionCheckpoint",
      checkpointId: "aeb17efb-7dec-4d65-a57d-a20772bb3d8d",
      eventId: 38,
      recordedAt: "2026-10-21T13:36:25.252Z",
      stepId: "research",
    },
  },
];

describe("buildFlowRunEvents", () => {
  it("builds a run that succeeds", () => {
    expectEvents("succeeds", [
      runStartedWithNumbers,
      [
        "35.0",
        {
          kind: "stepStarted",
          stepRun: stepRun("firstTwo"),
          stepType: "takeFirst",
          inputs: firstTwoInputs,
        },
      ],
      [
        "36.0",
        { kind: "attemptStarted", stepRun: stepRun("firstTwo"), attempt: 1 },
      ],
      [
        "37.0",
        {
          kind: "attemptSucceeded",
          stepRun: stepRun("firstTwo"),
          attempt: 1,
          outputs: [{ outputName: "items", payload: numbers([3, 1]) }],
        },
      ],
      [
        "47.0",
        {
          kind: "stepStarted",
          stepRun: stepRun("count"),
          stepType: "aggregate",
          inputs: [
            {
              inputName: "aggregation",
              payload: { kind: "Aggregation", value: { operation: "count" } },
            },
            { inputName: "items", payload: numbers([3, 1]) },
          ],
        },
      ],
      [
        "48.0",
        { kind: "attemptStarted", stepRun: stepRun("count"), attempt: 1 },
      ],
      [
        "49.0",
        {
          kind: "attemptSucceeded",
          stepRun: stepRun("count"),
          attempt: 1,
          outputs: [{ outputName: "result", payload: number(2) }],
        },
      ],
      [
        "70.0",
        {
          kind: "runFinished",
          status: FlowRunStatus.Completed,
          flowOutputs: [
            { outputName: "firstTwo", payload: numbers([3, 1]) },
            { outputName: "count", payload: number(2) },
          ],
          stepErrors: [],
        },
      ],
    ]);
  });

  it("keeps the message of a successful step's status", () => {
    const { history } = loadFixture("succeeds");
    const [result] =
      history.find((event) => event.eventId?.toString() === "37")
        ?.activityTaskCompletedEventAttributes?.result?.payloads ?? [];

    if (!result?.data) {
      throw new Error("No result on history event 37 in succeeds");
    }

    /* The stub actions give no message, where real ones do. */
    result.data = Buffer.from(
      JSON.stringify({
        ...(JSON.parse(Buffer.from(result.data).toString()) as object),
        message: "Kept 2 of 3 items",
      }),
    );

    expect(
      buildFlowRunEvents(history).find(({ position }) => position === "37.0"),
    ).toMatchObject({ kind: "attemptSucceeded", message: "Kept 2 of 3 items" });
  });

  it("reports the attempts before a retried step's last as hidden, with the last one's error", () => {
    expectEvents("retried-then-succeeds", [
      runStartedWithNumbers,
      [
        "35.0",
        {
          kind: "stepStarted",
          stepRun: stepRun("firstTwo"),
          stepType: "takeFirst",
          inputs: firstTwoInputs,
        },
      ],
      [
        "36.0",
        {
          kind: "attemptStarted",
          stepRun: stepRun("firstTwo"),
          attempt: 3,
          hiddenAttempts: {
            count: 2,
            lastError: { message: "Flaky failure on attempt 2" },
          },
        },
      ],
      [
        "37.0",
        {
          kind: "attemptSucceeded",
          stepRun: stepRun("firstTwo"),
          attempt: 3,
          outputs: [{ outputName: "items", payload: numbers([3, 1]) }],
        },
      ],
      [
        "58.0",
        {
          kind: "runFinished",
          status: FlowRunStatus.Completed,
          flowOutputs: [{ outputName: "firstTwo", payload: numbers([3, 1]) }],
          stepErrors: [],
        },
      ],
    ]);
  });

  it("gives a step up when every attempt fails", () => {
    expectEvents("gives-up", [
      runStartedWithNumbers,
      [
        "35.0",
        {
          kind: "stepStarted",
          stepRun: stepRun("firstTwo"),
          stepType: "takeFirst",
          inputs: firstTwoInputs,
        },
      ],
      [
        "36.0",
        {
          kind: "attemptStarted",
          stepRun: stepRun("firstTwo"),
          attempt: 3,
          hiddenAttempts: {
            count: 2,
            lastError: { message: "Failure on attempt 2" },
          },
        },
      ],
      [
        "37.0",
        {
          kind: "attemptFailed",
          stepRun: stepRun("firstTwo"),
          attempt: 3,
          error: { message: "Failure on attempt 3" },
          retrying: false,
        },
      ],
      [
        "37.1",
        {
          kind: "stepGaveUp",
          stepRun: stepRun("firstTwo"),
          attempt: 3,
          reason: "attemptsExhausted",
        },
      ],
      [
        "52.0",
        {
          kind: "runFinished",
          status: FlowRunStatus.Failed,
          failure: { message: missingFirstTwoMessage },
          stepErrors: [
            {
              stepRun: stepRun("firstTwo"),
              error: {
                message: expect.stringContaining(
                  "Action takeFirst failed with status code INTERNAL: Error executing action takeFirst",
                ) as string,
              },
            },
          ],
        },
      ],
    ]);
  });

  it("gives a step up when its action completes with an error status", () => {
    expectEvents("error-status", [
      runStartedWithNumbers,
      [
        "35.0",
        {
          kind: "stepStarted",
          stepRun: stepRun("firstTwo"),
          stepType: "takeFirst",
          inputs: firstTwoInputs,
        },
      ],
      [
        "36.0",
        { kind: "attemptStarted", stepRun: stepRun("firstTwo"), attempt: 1 },
      ],
      [
        "37.0",
        {
          kind: "attemptFailed",
          stepRun: stepRun("firstTwo"),
          attempt: 1,
          error: { message: "The count must be a whole number" },
          retrying: false,
        },
      ],
      [
        "37.1",
        {
          kind: "stepGaveUp",
          stepRun: stepRun("firstTwo"),
          attempt: 1,
          reason: "errorStatus",
        },
      ],
      [
        "52.0",
        {
          kind: "runFinished",
          status: FlowRunStatus.Failed,
          failure: { message: missingFirstTwoMessage },
          stepErrors: [
            {
              stepRun: stepRun("firstTwo"),
              error: {
                message:
                  "Action takeFirst failed with status code INVALID_ARGUMENT: The count must be a whole number",
              },
            },
          ],
        },
      ],
    ]);
  });

  it("fails a run whose failure has no step errors in its details", () => {
    expectEvents("unknown-step-input", [
      runStartedWithNumbers,
      [
        "35.0",
        {
          kind: "runFinished",
          status: FlowRunStatus.Failed,
          failure: {
            message:
              "Definition for inputName 'limit' in step firstTwo not found in action definition takeFirst",
          },
        },
      ],
    ]);
  });

  it("reports skipped steps when they were skipped, from the memo", () => {
    const skippedAt = "2026-10-21T13:36:04.312Z";

    expectEvents("skipped", [
      ["1.0", { kind: "runStarted", flowInputs: { number: number(8) } }],
      [
        "35.0",
        {
          kind: "stepStarted",
          stepRun: stepRun("check"),
          stepType: "if",
          inputs: [
            { inputName: "value", payload: number(8) },
            {
              inputName: "condition",
              payload: {
                kind: "FilterCondition",
                value: {
                  kind: "all",
                  conditions: [
                    {
                      kind: "condition",
                      subject: { kind: "input", payloadKind: "Number" },
                      operator: "greaterThanOrEqual",
                      value: { kind: "Number", value: 50 },
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
      [
        "36.0",
        { kind: "attemptStarted", stepRun: stepRun("check"), attempt: 1 },
      ],
      [
        "37.0",
        {
          kind: "attemptSucceeded",
          stepRun: stepRun("check"),
          attempt: 1,
          outputs: [{ outputName: "false", payload: number(8) }],
        },
      ],
      [
        "47.0",
        {
          kind: "stepSkipped",
          stepRun: stepRun("keep"),
          stepType: "takeFirst",
        },
        skippedAt,
      ],
      [
        "47.1",
        {
          kind: "stepSkipped",
          stepRun: stepRun("countKept"),
          stepType: "aggregate",
        },
        skippedAt,
      ],
      [
        "59.0",
        {
          kind: "runFinished",
          status: FlowRunStatus.Completed,
          flowOutputs: [],
          stepErrors: [],
        },
      ],
    ]);
  });

  it("starts a forEach when the engine fans it out, before the steps of its items", () => {
    const wrapStarted = (position: string, item: number, value: number) =>
      [
        position,
        {
          kind: "stepStarted",
          stepRun: stepRun("wrap", item),
          stepType: "takeFirst",
          inputs: [
            { inputName: "items", payload: numbers([value]) },
            { inputName: "count", payload: number(1) },
          ],
        },
      ] satisfies ExpectedEvent;

    const wrapAttempt = (
      startedPosition: string,
      succeededPosition: string,
      item: number,
      value: number,
    ): ExpectedEvent[] => [
      [
        startedPosition,
        { kind: "attemptStarted", stepRun: stepRun("wrap", item), attempt: 1 },
      ],
      [
        succeededPosition,
        {
          kind: "attemptSucceeded",
          stepRun: stepRun("wrap", item),
          attempt: 1,
          outputs: [{ outputName: "items", payload: numbers([value]) }],
        },
      ],
    ];

    expectEvents("for-each", [
      runStartedWithNumbers,
      [
        "35.0",
        {
          kind: "forEachStarted",
          stepRun: stepRun("eachNumber"),
          itemCount: 3,
        },
        "2026-10-22T16:36:33.718Z",
      ],
      wrapStarted("42.0", 0, 3),
      wrapStarted("43.0", 1, 1),
      wrapStarted("44.0", 2, 4),
      ...wrapAttempt("45.0", "46.0", 0, 3),
      ...wrapAttempt("48.0", "49.0", 2, 4),
      ...wrapAttempt("50.0", "51.0", 1, 1),
      [
        "71.0",
        {
          kind: "runFinished",
          status: FlowRunStatus.Completed,
          flowOutputs: [
            { outputName: "collected", payload: numbers([3, 1, 4]) },
          ],
          stepErrors: [],
        },
      ],
    ]);
  });

  it("starts a forEach over no items", () => {
    expectEvents("for-each-empty", [
      ["1.0", { kind: "runStarted", flowInputs: { numbers: numbers([]) } }],
      [
        "35.0",
        {
          kind: "forEachStarted",
          stepRun: stepRun("eachNumber"),
          itemCount: 0,
        },
        "2026-10-22T16:36:36.430Z",
      ],
      [
        "53.0",
        {
          kind: "runFinished",
          status: FlowRunStatus.Completed,
          flowOutputs: [{ outputName: "collected", payload: numbers([]) }],
          stepErrors: [],
        },
      ],
    ]);
  });

  it("reports an input request and its answer, with the step that asked", () => {
    const requestId = "3a160602-bf37-476d-86ce-93fe79cef08e";

    expectEvents("input-request", [
      runStartedWithPrompt,
      researchStarted("35.0"),
      [
        "36.0",
        {
          kind: "inputRequested",
          stepRun: research,
          request: {
            requestId,
            stepId: "research",
            type: "human-input",
            data: { questions: ["Which HASH do you mean?"] },
          },
        },
      ],
      [
        "40.0",
        {
          kind: "inputResolved",
          requestStepRun: research,
          requestId,
          response: {
            requestId,
            type: "human-input",
            data: { answers: ["The company"] },
            resolvedBy:
              "00000000-0000-4000-8000-0000000000a1" as ActorEntityUuid,
          },
        },
      ],
      ["44.0", { kind: "attemptStarted", stepRun: research, attempt: 1 }],
      researchSucceeded("45.0"),
      researchRunCompleted("66.0"),
    ]);
  });

  it("reports each progress log, with the attempt that logged it", () => {
    expectEvents("progress-logs", [
      runStartedWithPrompt,
      researchStarted("35.0"),
      [
        "36.0",
        {
          kind: "progressLogged",
          stepRun: research,
          loggedInAttempt: 1,
          log: planLog(
            "CreatedPlan",
            "Search the web",
            "2026-10-21T13:36:14.661Z",
          ),
        },
      ],
      [
        "36.1",
        {
          kind: "progressLogged",
          stepRun: research,
          loggedInAttempt: 1,
          log: planLog(
            "UpdatedPlan",
            "Search the web, then read",
            "2026-10-21T13:36:14.661Z",
          ),
        },
      ],
      [
        "40.0",
        {
          kind: "progressLogged",
          stepRun: research,
          loggedInAttempt: 1,
          log: planLog(
            "UpdatedPlan",
            "Read what was found",
            "2026-10-21T13:36:15.666Z",
          ),
        },
      ],
      ["44.0", { kind: "attemptStarted", stepRun: research, attempt: 1 }],
      researchSucceeded("45.0"),
      researchRunCompleted("66.0"),
    ]);
  });

  it("reports a run cancelled while a step runs, with the step's attempt started after its cancellation was requested", () => {
    expectEvents("cancelled", [
      runStartedWithPrompt,
      researchStarted("35.0"),
      ["40.0", { kind: "attemptCancellationRequested", stepRun: research }],
      ["41.0", { kind: "attemptStarted", stepRun: research, attempt: 1 }],
      ["42.0", { kind: "attemptCancelled", stepRun: research }],
      ["46.0", { kind: "runFinished", status: FlowRunStatus.Cancelled }],
    ]);
  });

  it("builds a running run's events, with only the start of the step that runs", () => {
    expectEvents("in-progress", inProgressEvents);
  });

  it("builds the same events for a running run once it has finished, and more after them", () => {
    expectEvents("in-progress-finished", [
      ...inProgressEvents,
      ["40.0", { kind: "attemptStarted", stepRun: research, attempt: 1 }],
      researchSucceeded("41.0"),
      researchRunCompleted("62.0"),
    ]);
  });

  it("reports a checkpoint as a progress log, and the run reset to it as terminated", () => {
    expectEvents("reset-base-run", [
      runStartedWithPrompt,
      researchStarted("35.0"),
      checkpointLog,
      [
        "40.0",
        {
          kind: "progressLogged",
          stepRun: research,
          loggedInAttempt: 1,
          log: planLog(
            "CreatedPlan",
            "Search the web",
            "2026-10-21T13:36:26.261Z",
          ),
        },
      ],
      [
        "44.0",
        {
          kind: "runFinished",
          status: FlowRunStatus.Terminated,
          failure: { message: "aeb17efb-7dec-4d65-a57d-a20772bb3d8d" },
        },
      ],
    ]);
  });

  it("reports the reset that started a run, after the events it kept", () => {
    expectEvents("reset", [
      runStartedWithPrompt,
      researchStarted("35.0"),
      checkpointLog,
      [
        "39.0",
        { kind: "runReset", fromRunId: loadFixture("reset-base-run").runId },
      ],
      ["43.0", { kind: "attemptStarted", stepRun: research, attempt: 1 }],
      researchSucceeded("44.0"),
      researchRunCompleted("65.0"),
    ]);
  });
});
