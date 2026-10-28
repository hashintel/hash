import { describe, expect, it } from "vitest";

import { applyActualModeTransitionFiring } from "@hashintel/petrinaut-core";
import { typedActionDefinitions as actions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import {
  defineFlow,
  flowInput,
} from "@local/hash-isomorphic-utils/flows/define-flow";
import { FlowRunStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

import { compileFlowDefinition } from "./compile-flow-definition.js";
import { startFlowNetRun } from "./interpret-flow-net.js";
import {
  replayFlowRunEvents,
  toRootNetActualModeExecution,
} from "./replay-flow-run-events.js";
import {
  fileFlowDefinition,
  forEachFlowDefinition,
} from "./testing/flow-definitions.js";

import type { FlowRunReplay } from "./replay-flow-run-events.js";
import type { ActualModeMarking } from "@hashintel/petrinaut-core";
import type {
  FlowRunEvent,
  FlowRunEventStepRun,
} from "@local/hash-isomorphic-utils/flows/run-events";
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

/** A run of `forEachFlowDefinition` over two URLs, whose second item finishes first. */
const forEachRunEvents: UnplacedEvent[] = [
  {
    kind: "runStarted",
    flowInputs: {
      urls: { kind: "Text", value: ["https://a.com", "https://b.com"] },
    },
  },
  {
    kind: "forEachStarted",
    stepRun: { stepId: "each", itemPath: [] },
    itemCount: 2,
  },
  ...[1, 0].flatMap((index): UnplacedEvent[] => {
    const stepRun = { stepId: "get", itemPath: [index] };

    return [
      { ...getStarted, stepRun },
      { kind: "attemptStarted", stepRun, attempt: 1 },
      { kind: "attemptSucceeded", stepRun, attempt: 1, outputs: fileOutput },
    ];
  }),
  { kind: "runFinished", status: FlowRunStatus.Completed },
];

/** The held transitions an attempt in progress enables. */
const attemptEnds = (
  stepRun: { stepId: string; itemPath: number[] },
  attempt: number,
) => [
  { role: "succeedAttempt", stepRun, attempt },
  { role: "failAttempt", stepRun, attempt },
];

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
      ["2.0", "startStep"],
      ["2.0", "startAttempt"],
      ["4.0", "failAttempt"],
      ["4.0", "retryAttempt"],
      ["6.0", "succeedAttempt"],
    ]);
    expect(replay.firings.at(-1)?.occurredAt).toBe(
      new Date(5000).toISOString(),
    );
    expect(replay.held).toEqual([]);

    const run = startFlowNetRun(net, { flowInputNames: ["url"] });

    run.fire({ role: "failAttempt", stepRun: getStepRun });
    run.fire({ role: "retryAttempt", stepRun: getStepRun });
    run.fire({
      role: "succeedAttempt",
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
    expect(replay.held).toEqual(attemptEnds(getStepRun, 3));
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
    expect(replay.held).toEqual([]);
  });

  it("starts a step when its events say it started, not when its inputs arrive", async () => {
    /* `page` and `file` run in one batch, so `settings`, which only reads `page`'s output, waits for `file` too. */
    const net = await compileFlowDefinition(
      defineFlow(
        {
          flowDefinitionId: "page-and-file",
          name: "Page and file",
          description: "Get a page's settings, and a file",
          inputs: { url: flowInput("Text") },
        },
        ({ inputs, step }) => {
          const getPage = step("page", actions.getWebPageByUrl, {
            description: "Retrieve the page",
            inputs: { url: inputs.url },
          });
          const settings = step(
            "settings",
            actions.processAutomaticBrowsingSettings,
            {
              description: "Work out the page's settings",
              inputs: { webPage: getPage.outputs.webPage },
            },
          );
          const getFile = step("file", actions.getFileFromUrl, {
            description: "Retrieve the file",
            inputs: { url: inputs.url },
          });

          return {
            outputs: {
              model: settings.outputs.model,
              file: getFile.outputs.fileEntity,
            },
          };
        },
      ).flowDefinition,
    );
    const pageRun: FlowRunEventStepRun = { stepId: "page", itemPath: [] };
    const settingsRun: FlowRunEventStepRun = {
      stepId: "settings",
      itemPath: [],
    };
    const fileRun: FlowRunEventStepRun = { stepId: "file", itemPath: [] };

    const untilFileSucceeds: UnplacedEvent[] = [
      runStarted,
      { ...getStarted, stepRun: pageRun, stepType: "getWebPageByUrl" },
      { ...getStarted, stepRun: fileRun },
      { kind: "attemptStarted", stepRun: pageRun, attempt: 1 },
      { kind: "attemptStarted", stepRun: fileRun, attempt: 1 },
      {
        kind: "attemptSucceeded",
        stepRun: pageRun,
        attempt: 1,
        outputs: [
          {
            outputName: "webPage",
            payload: {
              kind: "WebPage",
              value: { url: "https://example.com", title: "", htmlContent: "" },
            },
          } as StepOutput,
        ],
      },
    ];

    const whileFileRuns = replayFlowRunEvents(net, placed(untilFileSucceeds));

    expect(whileFileRuns.problems).toEqual([]);
    expect(
      whileFileRuns.firings.filter(
        ({ stepRun }) => stepRun.stepId === "settings",
      ),
    ).toEqual([]);
    expect(whileFileRuns.held).toContainEqual({
      role: "startStep",
      stepRun: settingsRun,
    });

    const replay = replayFlowRunEvents(
      net,
      placed([
        ...untilFileSucceeds,
        {
          kind: "attemptSucceeded",
          stepRun: fileRun,
          attempt: 1,
          outputs: fileOutput,
        },
        {
          ...getStarted,
          stepRun: settingsRun,
          stepType: "processAutomaticBrowsingSettings",
        },
      ]),
    );

    expect(replay.problems).toEqual([]);
    expect(
      replay.firings
        .filter(({ stepRun }) => stepRun.stepId === "settings")
        .map(({ eventPosition, role }) => [eventPosition, role]),
    ).toEqual([
      ["8.0", "startStep"],
      ["8.0", "startAttempt"],
    ]);
  });

  it("starts a step whose attempt started without its start recorded", async () => {
    const net = await compileFlowDefinition(fileFlowDefinition);

    const replay = replayFlowRunEvents(
      net,
      placed([
        runStarted,
        { kind: "attemptStarted", stepRun: getStepRun, attempt: 1 },
      ]),
    );

    expect(replay.problems).toEqual([]);
    expect(rolesByEvent(replay)).toEqual([
      ["2.0", "startStep"],
      ["2.0", "startAttempt"],
    ]);
    expect(replay.held).toEqual(attemptEnds(getStepRun, 1));
  });

  it("starts a forEach step's items when it learns how many there are", async () => {
    const net = await compileFlowDefinition(forEachFlowDefinition);

    const replay = replayFlowRunEvents(net, placed(forEachRunEvents));

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
    expect(replay.held).toEqual([]);
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
        message: "get [0] started before the net had its inputs",
      },
      {
        eventPosition: "4.0",
        message: "get [0] has no attempt in progress",
      },
    ]);
    expect(replay.held).toEqual(attemptEnds(firstItem, 2));
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
      held: [],
      problems: [],
      skippedStepRuns: [],
    });
  });
});

describe("toRootNetActualModeExecution", () => {
  it("replays in Actual mode to the run's tokens in the root net", async () => {
    const net = await compileFlowDefinition(forEachFlowDefinition);
    const replay = replayFlowRunEvents(net, placed(forEachRunEvents));
    const { initialState, transitionFirings } =
      toRootNetActualModeExecution(replay);
    const rootTransitionIds = new Set(net.transitions.map(({ id }) => id));
    const rootPlaceIds = new Set(net.places.map(({ id }) => id));

    let marking: ActualModeMarking = initialState;

    for (const firing of transitionFirings) {
      expect(rootTransitionIds.has(firing.transitionId)).toBe(true);
      expect(
        [...Object.keys(firing.input), ...Object.keys(firing.output)].every(
          (placeId) => rootPlaceIds.has(placeId),
        ),
      ).toBe(true);

      marking = applyActualModeTransitionFiring(marking, firing);

      expect(
        Object.values(marking).every(
          (count) => typeof count === "number" && count >= 0,
        ),
      ).toBe(true);
    }

    const rootCounts: Record<string, number> = {};

    for (const { position } of replay.marking) {
      if (position.kind === "place") {
        rootCounts[position.placeId] = (rootCounts[position.placeId] ?? 0) + 1;
      }
    }

    expect(
      Object.fromEntries(
        Object.entries(marking).filter(([, count]) => count !== 0),
      ),
    ).toEqual(rootCounts);
    expect(transitionFirings.at(-1)?.ts).toBe(
      replay.firings.at(-1)?.occurredAt,
    );
  });
});
