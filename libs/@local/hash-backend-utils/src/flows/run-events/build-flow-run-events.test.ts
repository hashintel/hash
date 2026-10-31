import { readFileSync } from "node:fs";

import proto from "@temporalio/proto";
import { describe, expect, it } from "vitest";

import { FlowRunStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { StatusCode } from "@local/status";

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

const { EventType, RetryState } = proto.temporal.api.enums.v1;

type IHistoryEvent = proto.temporal.api.history.v1.IHistoryEvent;

/** A history whose failed attempts time out instead, in `retryState`. */
const withLastAttemptTimedOut = (
  history: IHistoryEvent[],
  retryState: proto.temporal.api.enums.v1.RetryState,
): IHistoryEvent[] =>
  history.map((event) => {
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
            retryState,
          },
        }
      : event;
  });

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

const researchSucceeded = (position: string, attempt = 1): ExpectedEvent => [
  position,
  {
    kind: "attemptSucceeded",
    stepRun: research,
    attempt,
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

const firstTwoStarted: ExpectedEvent = [
  "35.0",
  {
    kind: "stepStarted",
    stepRun: stepRun("firstTwo"),
    stepType: "takeFirst",
    inputs: firstTwoInputs,
  },
];

const attemptStarted = (
  position: string,
  run: FlowRunEventStepRun,
  attempt: number,
): ExpectedEvent => [
  position,
  { kind: "attemptStarted", stepRun: run, attempt },
];

const attemptRetried = (
  position: string,
  run: FlowRunEventStepRun,
  attempt: number,
  message: string,
): ExpectedEvent => [
  position,
  {
    kind: "attemptFailed",
    stepRun: run,
    attempt,
    error: { message },
    retrying: true,
  },
];

const inProgressEvents: ExpectedEvent[] = [
  runStartedWithPrompt,
  researchStarted("35.0"),
  attemptStarted("36.0", research, 1),
  attemptRetried("40.0", research, 1, "Flaky failure on attempt 1"),
  attemptStarted("44.0", research, 2),
  [
    "48.0",
    {
      kind: "progressLogged",
      stepRun: research,
      loggedInAttempt: 2,
      log: planLog("CreatedPlan", "Search the web", "2026-10-27T10:52:03.974Z"),
    },
  ],
];

const checkpointId = "23022ee1-7f04-4a6d-9588-771bf4157d7a";

const checkpointLog: ExpectedEvent = [
  "40.0",
  {
    kind: "progressLogged",
    stepRun: research,
    log: {
      type: "ResearchActionCheckpoint",
      checkpointId,
      eventId: 42,
      recordedAt: "2026-10-24T11:10:54.468Z",
      stepId: "research",
    },
  },
];

describe("buildFlowRunEvents", () => {
  it("builds a run that succeeds", () => {
    expectEvents("succeeds", [
      runStartedWithNumbers,
      firstTwoStarted,
      attemptStarted("36.0", stepRun("firstTwo"), 1),
      [
        "41.0",
        {
          kind: "attemptSucceeded",
          stepRun: stepRun("firstTwo"),
          attempt: 1,
          outputs: [{ outputName: "items", payload: numbers([3, 1]) }],
        },
      ],
      [
        "51.0",
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
      attemptStarted("52.0", stepRun("count"), 1),
      [
        "57.0",
        {
          kind: "attemptSucceeded",
          stepRun: stepRun("count"),
          attempt: 1,
          outputs: [{ outputName: "result", payload: number(2) }],
        },
      ],
      [
        "78.0",
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
      history.find((event) => event.eventId?.toString() === "41")
        ?.activityTaskCompletedEventAttributes?.result?.payloads ?? [];

    if (!result?.data) {
      throw new Error("No result on history event 41 in succeeds");
    }

    /* The stub actions give no message, where real ones do. */
    result.data = Buffer.from(
      JSON.stringify({
        ...(JSON.parse(Buffer.from(result.data).toString()) as object),
        message: "Kept 2 of 3 items",
      }),
    );

    expect(
      buildFlowRunEvents(history).find(({ position }) => position === "41.0"),
    ).toMatchObject({ kind: "attemptSucceeded", message: "Kept 2 of 3 items" });
  });

  it("reports each attempt of a retried step, with its error", () => {
    expectEvents("retried-then-succeeds", [
      runStartedWithNumbers,
      firstTwoStarted,
      attemptStarted("36.0", stepRun("firstTwo"), 1),
      attemptRetried(
        "40.0",
        stepRun("firstTwo"),
        1,
        "Flaky failure on attempt 1",
      ),
      attemptStarted("44.0", stepRun("firstTwo"), 2),
      attemptRetried(
        "48.0",
        stepRun("firstTwo"),
        2,
        "Flaky failure on attempt 2",
      ),
      attemptStarted("52.0", stepRun("firstTwo"), 3),
      [
        "57.0",
        {
          kind: "attemptSucceeded",
          stepRun: stepRun("firstTwo"),
          attempt: 3,
          outputs: [{ outputName: "items", payload: numbers([3, 1]) }],
        },
      ],
      [
        "84.0",
        {
          kind: "runFinished",
          status: FlowRunStatus.Completed,
          flowOutputs: [{ outputName: "firstTwo", payload: numbers([3, 1]) }],
          stepErrors: [],
        },
      ],
    ]);
  });

  it("reports the attempts whose signals didn't arrive as hidden, with the last one's error", () => {
    expectEvents("retried-with-signals-lost", [
      runStartedWithNumbers,
      firstTwoStarted,
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

  describe("when some attempt signals didn't arrive", () => {
    /** The history of `retried-then-succeeds` without these attempt signals. */
    const withoutSignals = (
      lost: [
        signalName: "stepAttemptStarted" | "stepAttemptFailed",
        attempt: number,
      ][],
    ) =>
      loadFixture("retried-then-succeeds").history.filter((event) => {
        const signal = event.workflowExecutionSignaledEventAttributes;
        const data = signal?.input?.payloads?.[0]?.data;

        if (!signal?.signalName || !data) {
          return true;
        }

        const { attempt } = JSON.parse(Buffer.from(data).toString()) as {
          attempt?: number;
        };

        return !lost.some(
          ([signalName, lostAttempt]) =>
            signalName === signal.signalName && lostAttempt === attempt,
        );
      });

    /** What the events say about each attempt. */
    const attemptEventsOf = (history: IHistoryEvent[]) =>
      buildFlowRunEvents(history).flatMap(
        (event): Record<string, unknown>[] => {
          switch (event.kind) {
            case "attemptStarted":
              return [
                {
                  kind: event.kind,
                  attempt: event.attempt,
                  ...(event.hiddenAttempts
                    ? { hiddenAttempts: event.hiddenAttempts }
                    : {}),
                },
              ];
            case "attemptFailed":
              return [
                {
                  kind: event.kind,
                  attempt: event.attempt,
                  error: event.error.message,
                },
              ];
            case "attemptSucceeded":
              return [{ kind: event.kind, attempt: event.attempt }];
            default:
              return [];
          }
        },
      );

    it("reports the attempts before a signalled start as hidden", () => {
      expect(
        attemptEventsOf(
          withoutSignals([
            ["stepAttemptStarted", 1],
            ["stepAttemptFailed", 1],
            ["stepAttemptStarted", 2],
            ["stepAttemptFailed", 2],
          ]),
        ),
      ).toStrictEqual([
        {
          kind: "attemptStarted",
          attempt: 3,
          hiddenAttempts: {
            count: 2,
            lastError: { message: "Flaky failure on attempt 2" },
          },
        },
        { kind: "attemptSucceeded", attempt: 3 },
      ]);
    });

    it("reports an attempt between signalled ones as hidden", () => {
      expect(
        attemptEventsOf(
          withoutSignals([
            ["stepAttemptStarted", 2],
            ["stepAttemptFailed", 2],
          ]),
        ),
      ).toStrictEqual([
        { kind: "attemptStarted", attempt: 1 },
        {
          kind: "attemptFailed",
          attempt: 1,
          error: "Flaky failure on attempt 1",
        },
        {
          kind: "attemptStarted",
          attempt: 3,
          hiddenAttempts: {
            count: 1,
            lastError: { message: "Flaky failure on attempt 2" },
          },
        },
        { kind: "attemptSucceeded", attempt: 3 },
      ]);
    });

    it("fails an attempt whose failure signal didn't arrive with the error the next attempt's start carries", () => {
      expect(
        attemptEventsOf(withoutSignals([["stepAttemptFailed", 1]])),
      ).toStrictEqual([
        { kind: "attemptStarted", attempt: 1 },
        {
          kind: "attemptFailed",
          attempt: 1,
          error: "Flaky failure on attempt 1",
        },
        { kind: "attemptStarted", attempt: 2 },
        {
          kind: "attemptFailed",
          attempt: 2,
          error: "Flaky failure on attempt 2",
        },
        { kind: "attemptStarted", attempt: 3 },
        { kind: "attemptSucceeded", attempt: 3 },
      ]);
    });

    it("reports each hidden attempt once, when Temporal records the start of a later attempt", () => {
      expect(
        attemptEventsOf(
          withoutSignals([
            ["stepAttemptStarted", 1],
            ["stepAttemptFailed", 1],
            ["stepAttemptStarted", 3],
          ]),
        ),
      ).toStrictEqual([
        {
          kind: "attemptStarted",
          attempt: 2,
          hiddenAttempts: {
            count: 1,
            lastError: { message: "Flaky failure on attempt 1" },
          },
        },
        {
          kind: "attemptFailed",
          attempt: 2,
          error: "Flaky failure on attempt 2",
        },
        { kind: "attemptStarted", attempt: 3 },
        { kind: "attemptSucceeded", attempt: 3 },
      ]);
    });
  });

  it("gives a step up when every attempt fails, with the last attempt's failure once, from the history", () => {
    expectEvents("gives-up", [
      runStartedWithNumbers,
      firstTwoStarted,
      attemptStarted("36.0", stepRun("firstTwo"), 1),
      attemptRetried("40.0", stepRun("firstTwo"), 1, "Failure on attempt 1"),
      attemptStarted("44.0", stepRun("firstTwo"), 2),
      attemptRetried("48.0", stepRun("firstTwo"), 2, "Failure on attempt 2"),
      attemptStarted("52.0", stepRun("firstTwo"), 3),
      [
        "57.0",
        {
          kind: "attemptFailed",
          stepRun: stepRun("firstTwo"),
          attempt: 3,
          error: { message: "Failure on attempt 3" },
          retrying: false,
        },
      ],
      [
        "57.1",
        {
          kind: "stepGaveUp",
          stepRun: stepRun("firstTwo"),
          attempt: 3,
          reason: "attemptsExhausted",
        },
      ],
      [
        "78.0",
        {
          kind: "runFinished",
          status: FlowRunStatus.Failed,
          failure: {
            message: missingFirstTwoMessage,
            code: StatusCode.NotFound,
          },
          stepErrors: [
            {
              stepRun: stepRun("firstTwo"),
              error: {
                message: expect.stringContaining(
                  "Action takeFirst failed with status code INTERNAL: Error executing action takeFirst",
                ) as string,
                code: StatusCode.Internal,
              },
            },
          ],
        },
      ],
    ]);
  });

  it.each([
    ["RETRY_STATE_MAXIMUM_ATTEMPTS_REACHED", "attemptsExhausted"],
    ["RETRY_STATE_TIMEOUT", "timedOut"],
    ["RETRY_STATE_UNSPECIFIED", "timedOut"],
  ] as const)(
    "gives a step whose last attempt timed out in %s up as %s",
    (retryState, reason) => {
      const { history } = loadFixture("gives-up");

      expect(
        buildFlowRunEvents(
          withLastAttemptTimedOut(history, RetryState[retryState]),
        ).find(({ position }) => position === "57.1"),
      ).toMatchObject({ kind: "stepGaveUp", attempt: 3, reason });
    },
  );

  it("fails an attempt that ended without throwing with Temporal's reason, when the next one starts", () => {
    expectEvents("attempt-timed-out", [
      runStartedWithPrompt,
      researchStarted("35.0"),
      attemptStarted("36.0", research, 1),
      attemptRetried("40.0", research, 1, "activity Heartbeat timeout"),
      attemptStarted("40.1", research, 2),
      researchSucceeded("45.0", 2),
      researchRunCompleted("72.0"),
    ]);
  });

  it("gives a step up when its action completes with an error status", () => {
    expectEvents("error-status", [
      runStartedWithNumbers,
      firstTwoStarted,
      attemptStarted("36.0", stepRun("firstTwo"), 1),
      [
        "41.0",
        {
          kind: "attemptFailed",
          stepRun: stepRun("firstTwo"),
          attempt: 1,
          error: { message: "The count must be a whole number" },
          retrying: false,
        },
      ],
      [
        "41.1",
        {
          kind: "stepGaveUp",
          stepRun: stepRun("firstTwo"),
          attempt: 1,
          reason: "errorStatus",
        },
      ],
      [
        "56.0",
        {
          kind: "runFinished",
          status: FlowRunStatus.Failed,
          failure: {
            message: missingFirstTwoMessage,
            code: StatusCode.NotFound,
          },
          stepErrors: [
            {
              stepRun: stepRun("firstTwo"),
              error: {
                message:
                  "Action takeFirst failed with status code INVALID_ARGUMENT: The count must be a whole number",
                code: StatusCode.Internal,
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
            code: StatusCode.FailedPrecondition,
          },
        },
      ],
    ]);
  });

  it("reports skipped steps when they were skipped, from the memo", () => {
    const skippedAt = "2026-10-24T11:09:15.295Z";

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
      attemptStarted("36.0", stepRun("check"), 1),
      [
        "41.0",
        {
          kind: "attemptSucceeded",
          stepRun: stepRun("check"),
          attempt: 1,
          outputs: [{ outputName: "false", payload: number(8) }],
        },
      ],
      [
        "51.0",
        {
          kind: "stepSkipped",
          stepRun: stepRun("keep"),
          stepType: "takeFirst",
        },
        skippedAt,
      ],
      [
        "51.1",
        {
          kind: "stepSkipped",
          stepRun: stepRun("countKept"),
          stepType: "aggregate",
        },
        skippedAt,
      ],
      [
        "63.0",
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

    const wrapSucceeded = (
      position: string,
      item: number,
      value: number,
    ): ExpectedEvent => [
      position,
      {
        kind: "attemptSucceeded",
        stepRun: stepRun("wrap", item),
        attempt: 1,
        outputs: [{ outputName: "items", payload: numbers([value]) }],
      },
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
        "2026-10-24T11:09:17.816Z",
      ],
      wrapStarted("42.0", 0, 3),
      wrapStarted("43.0", 1, 1),
      wrapStarted("44.0", 2, 4),
      attemptStarted("45.0", stepRun("wrap", 2), 1),
      attemptStarted("47.0", stepRun("wrap", 0), 1),
      attemptStarted("48.0", stepRun("wrap", 1), 1),
      wrapSucceeded("54.0", 2, 4),
      wrapSucceeded("55.0", 0, 3),
      wrapSucceeded("56.0", 1, 1),
      [
        "77.0",
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
        "2026-10-24T11:09:20.343Z",
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
    const requestId = "a420afc6-cc65-418e-8053-d093a23f54da";

    expectEvents("input-request", [
      runStartedWithPrompt,
      researchStarted("35.0"),
      attemptStarted("36.0", research, 1),
      [
        "40.0",
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
        "41.0",
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
      researchSucceeded("54.0"),
      researchRunCompleted("81.0"),
    ]);
  });

  it("reports each progress log, with the attempt that logged it", () => {
    expectEvents("progress-logs", [
      runStartedWithPrompt,
      researchStarted("35.0"),
      attemptStarted("36.0", research, 1),
      [
        "40.0",
        {
          kind: "progressLogged",
          stepRun: research,
          loggedInAttempt: 1,
          log: planLog(
            "CreatedPlan",
            "Search the web",
            "2026-10-24T11:09:25.451Z",
          ),
        },
      ],
      [
        "40.1",
        {
          kind: "progressLogged",
          stepRun: research,
          loggedInAttempt: 1,
          log: planLog(
            "UpdatedPlan",
            "Search the web, then read",
            "2026-10-24T11:09:25.451Z",
          ),
        },
      ],
      [
        "44.0",
        {
          kind: "progressLogged",
          stepRun: research,
          loggedInAttempt: 1,
          log: planLog(
            "UpdatedPlan",
            "Read what was found",
            "2026-10-24T11:09:26.453Z",
          ),
        },
      ],
      researchSucceeded("49.0"),
      researchRunCompleted("70.0"),
    ]);
  });

  it("reports a run cancelled while a step runs", () => {
    expectEvents("cancelled", [
      runStartedWithPrompt,
      researchStarted("35.0"),
      attemptStarted("36.0", research, 1),
      ["44.0", { kind: "attemptCancellationRequested", stepRun: research }],
      ["46.0", { kind: "attemptCancelled", stepRun: research }],
      ["50.0", { kind: "runFinished", status: FlowRunStatus.Cancelled }],
    ]);
  });

  it("builds a running run's events, up to the attempt that runs", () => {
    expectEvents("in-progress", inProgressEvents);
  });

  it("builds the same events for a running run once it has finished, and more after them", () => {
    expectEvents("in-progress-finished", [
      ...inProgressEvents,
      researchSucceeded("53.0", 2),
      researchRunCompleted("80.0"),
    ]);
  });

  it("reports a checkpoint as a progress log, and the run reset to it as terminated", () => {
    expectEvents("reset-base-run", [
      runStartedWithPrompt,
      researchStarted("35.0"),
      attemptStarted("36.0", research, 1),
      checkpointLog,
      [
        "44.0",
        {
          kind: "progressLogged",
          stepRun: research,
          loggedInAttempt: 1,
          log: planLog(
            "CreatedPlan",
            "Search the web",
            "2026-10-24T11:10:55.480Z",
          ),
        },
      ],
      [
        "48.0",
        {
          kind: "runFinished",
          status: FlowRunStatus.Terminated,
          failure: { message: checkpointId },
        },
      ],
    ]);
  });

  it("reports the reset that started a run, after the events it kept", () => {
    expectEvents("reset", [
      runStartedWithPrompt,
      researchStarted("35.0"),
      attemptStarted("36.0", research, 1),
      checkpointLog,
      [
        "43.0",
        { kind: "runReset", fromRunId: loadFixture("reset-base-run").runId },
      ],
      attemptStarted("47.0", research, 1),
      researchSucceeded("49.0"),
      researchRunCompleted("70.0"),
    ]);
  });
});
