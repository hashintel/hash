import { describe, expect, it } from "vitest";

import { typedActionDefinitions as actions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import {
  defineFlow,
  flowInput,
} from "@local/hash-isomorphic-utils/flows/define-flow";
import { FlowRunStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

import { compileFlowDefinition } from "./compile-flow-definition.js";
import { startFlowNetRun } from "./interpret-flow-net.js";
import { replayFlowRunEvents } from "./replay-flow-run-events.js";

import type { FlowRunReplay } from "./replay-flow-run-events.js";
import type { FlowRunEvent } from "@local/hash-isomorphic-utils/flows/run-events";
import type { StepOutput } from "@local/hash-isomorphic-utils/flows/types";

type UnplacedEvent<Event = FlowRunEvent> = Event extends unknown
  ? Omit<Event, "position" | "occurredAt">
  : never;

/** Gives each event a position and a time a second after the one before. */
const placed = (events: UnplacedEvent[]): FlowRunEvent[] =>
  events.map(
    (event, index) =>
      ({
        ...event,
        position: `${index + 1}.0`,
        occurredAt: new Date(index * 1000).toISOString(),
      }) as FlowRunEvent,
  );

const fileOutput: StepOutput[] = [
  { outputName: "fileEntity", payload: { kind: "Text", value: "a file" } },
];

const rolesByEvent = (replay: FlowRunReplay) =>
  replay.firings.map(({ eventPosition, role }) => [eventPosition, role]);

const fileFlowDefinition = defineFlow(
  {
    flowDefinitionId: "get-file",
    name: "Get file",
    description: "Get a file from a URL",
    inputs: { url: flowInput("Text") },
  },
  ({ inputs, step }) => {
    const getFile = step("get", actions.getFileFromUrl, {
      description: "Retrieve the file from the URL",
      inputs: { url: inputs.url },
    });

    return { outputs: { file: getFile.outputs.fileEntity } };
  },
).flowDefinition;

const forEachFlowDefinition = defineFlow(
  {
    flowDefinitionId: "get-files",
    name: "Get files",
    description: "Get a file from each URL",
    inputs: { urls: flowInput("Text", { array: true }) },
  },
  ({ inputs, forEach }) => {
    const files = forEach("each", inputs.urls, {
      description: "Retrieve each file",
      collectAs: "files",
      steps: (url, scope) =>
        scope.step("get", actions.getFileFromUrl, {
          description: "Retrieve the file",
          inputs: { url },
        }).outputs.fileEntity,
    });

    return { outputs: { files } };
  },
).flowDefinition;

const runStarted: UnplacedEvent = {
  kind: "runStarted",
  flowInputs: { url: { kind: "Text", value: "https://example.com/file" } },
};

const getStepRun = { stepId: "get", itemPath: [] };

const getStarted: UnplacedEvent = {
  kind: "stepStarted",
  stepRun: getStepRun,
  stepType: "getFileFromUrl",
  inputs: [],
};

describe("replayFlowRunEvents", () => {
  it("follows a step's attempts to its outputs", async () => {
    const net = await compileFlowDefinition(fileFlowDefinition);

    const replay = replayFlowRunEvents(
      net,
      placed([
        runStarted,
        getStarted,
        { kind: "attemptStarted", stepRun: getStepRun, attempt: 1 },
        {
          kind: "attemptFailed",
          stepRun: getStepRun,
          attempt: 1,
          error: { message: "Not found" },
          retrying: true,
        },
        { kind: "attemptStarted", stepRun: getStepRun, attempt: 2 },
        {
          kind: "attemptSucceeded",
          stepRun: getStepRun,
          attempt: 2,
          outputs: fileOutput,
        },
      ]),
    );

    expect(replay.problems).toEqual([]);
    expect(rolesByEvent(replay)).toEqual([
      ["1.0", "startStep"],
      ["1.0", "startAttempt"],
      ["4.0", "failAttempt"],
      ["4.0", "retryAttempt"],
      ["6.0", "succeedAttempt"],
    ]);
    expect(replay.firings.at(-1)?.occurredAt).toBe(
      new Date(5000).toISOString(),
    );
    expect(replay.awaiting).toEqual([]);

    const run = startFlowNetRun(net, { flowInputNames: ["url"] });

    run.apply({ kind: "attemptFailed", stepRun: getStepRun, retrying: true });
    run.apply({
      kind: "attemptSucceeded",
      stepRun: getStepRun,
      outputNames: ["fileEntity"],
    });

    expect(replay.initialMarking).toEqual(run.initialMarking);
    expect(replay.marking).toEqual(run.marking());
  });

  it("fails the attempts Temporal retried without recording them", async () => {
    const net = await compileFlowDefinition(fileFlowDefinition);

    const replay = replayFlowRunEvents(
      net,
      placed([
        runStarted,
        getStarted,
        {
          kind: "attemptStarted",
          stepRun: getStepRun,
          attempt: 3,
          hiddenAttempts: { count: 2, lastError: { message: "Not found" } },
        },
      ]),
    );

    expect(replay.problems).toEqual([]);
    expect(rolesByEvent(replay).slice(2)).toEqual([
      ["3.0", "failAttempt"],
      ["3.0", "retryAttempt"],
      ["3.0", "failAttempt"],
      ["3.0", "retryAttempt"],
    ]);
    expect(replay.awaiting).toEqual([
      { kind: "actionOutcome", stepRun: getStepRun, attempt: 3 },
    ]);
  });

  it.each([
    ["after its last failure", true],
    ["when its last failure isn't recorded", false],
  ])("gives a step up once %s", async (_, lastFailureRecorded) => {
    const net = await compileFlowDefinition(fileFlowDefinition);

    const replay = replayFlowRunEvents(
      net,
      placed([
        runStarted,
        getStarted,
        { kind: "attemptStarted", stepRun: getStepRun, attempt: 1 },
        ...(lastFailureRecorded
          ? [
              {
                kind: "attemptFailed",
                stepRun: getStepRun,
                attempt: 1,
                error: { message: "Not found" },
                retrying: false,
              } as const,
            ]
          : []),
        {
          kind: "stepGaveUp",
          stepRun: getStepRun,
          attempt: 1,
          reason: "nonRetryable",
        },
      ]),
    );

    expect(replay.problems).toEqual([]);
    expect(
      replay.firings
        .map(({ role }) => role)
        .filter((role) => role === "giveUp" || role === "recordStepFailure"),
    ).toEqual(["giveUp", "recordStepFailure"]);
    expect(replay.awaiting).toEqual([]);
  });

  it("starts a forEach step's items when it learns how many there are", async () => {
    const net = await compileFlowDefinition(forEachFlowDefinition);
    const eachStepRun = { stepId: "each", itemPath: [] };

    const replay = replayFlowRunEvents(
      net,
      placed([
        {
          kind: "runStarted",
          flowInputs: {
            urls: { kind: "Text", value: ["https://a.com", "https://b.com"] },
          },
        },
        { kind: "forEachStarted", stepRun: eachStepRun, itemCount: 2 },
        ...[1, 0].flatMap((index): UnplacedEvent[] => {
          const stepRun = { stepId: "get", itemPath: [index] };

          return [
            { ...getStarted, stepRun },
            { kind: "attemptStarted", stepRun, attempt: 1 },
            {
              kind: "attemptSucceeded",
              stepRun,
              attempt: 1,
              outputs: fileOutput,
            },
          ];
        }),
        { kind: "runFinished", status: FlowRunStatus.Completed },
      ]),
    );

    expect(replay.problems).toEqual([]);
    expect(
      replay.firings
        .filter(({ stepRun }) => stepRun.stepId === "each")
        .map(({ eventPosition, role }) => [eventPosition, role]),
    ).toEqual([
      ["2.0", "startForEach"],
      ["2.0", "startItem"],
      ["2.0", "startItem"],
      ["2.0", "startCollecting"],
      ["5.0", "collectItem"],
      ["8.0", "collectItem"],
      ["8.0", "finishCollecting"],
    ]);
    expect(replay.awaiting).toEqual([]);
  });

  it("records the events the net can't follow, and goes on", async () => {
    const net = await compileFlowDefinition(forEachFlowDefinition);
    const firstItem = { stepId: "get", itemPath: [0] };

    const replay = replayFlowRunEvents(
      net,
      placed([
        { kind: "attemptStarted", stepRun: firstItem, attempt: 1 },
        {
          kind: "runStarted",
          flowInputs: { urls: { kind: "Text", value: ["https://a.com"] } },
        },
        { ...getStarted, stepRun: firstItem },
        {
          kind: "attemptSucceeded",
          stepRun: firstItem,
          attempt: 1,
          outputs: fileOutput,
        },
        {
          kind: "forEachStarted",
          stepRun: { stepId: "each", itemPath: [] },
          itemCount: 1,
        },
        { kind: "attemptStarted", stepRun: firstItem, attempt: 2 },
      ]),
    );

    expect(replay.problems).toEqual([
      {
        eventPosition: "1.0",
        message: "A attemptStarted event came before the run started",
      },
      {
        eventPosition: "3.0",
        message: "get [0] started before the net started it",
      },
      {
        eventPosition: "4.0",
        message: "The net isn't waiting on an attempt of get [0]",
      },
    ]);
    expect(replay.awaiting).toEqual([
      { kind: "actionOutcome", stepRun: firstItem, attempt: 2 },
    ]);
  });

  it("records skipped steps", async () => {
    const net = await compileFlowDefinition(fileFlowDefinition);

    const replay = replayFlowRunEvents(
      net,
      placed([
        runStarted,
        {
          kind: "stepSkipped",
          stepRun: getStepRun,
          stepType: "getFileFromUrl",
        },
      ]),
    );

    expect(replay.problems).toEqual([]);
    expect(replay.skippedStepRuns).toEqual([getStepRun]);
  });

  it("is empty until the run starts", async () => {
    const net = await compileFlowDefinition(fileFlowDefinition);

    expect(replayFlowRunEvents(net, [])).toEqual({
      initialMarking: [],
      firings: [],
      marking: [],
      awaiting: [],
      problems: [],
      skippedStepRuns: [],
    });
  });
});
