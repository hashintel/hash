import { describe, expect, it } from "vitest";

import {
  applyActualModeTransitionFiring,
  getArcEndpoint,
  toPetrinautId,
} from "@hashintel/petrinaut-core";
import {
  actionDefinitions,
  typedActionDefinitions as actions,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import {
  defineFlow,
  flowInput,
} from "@local/hash-isomorphic-utils/flows/define-flow";

import { compileFlowDefinition } from "./compile-flow-definition.js";
import {
  failedStepRunsPlaceKey,
  generateInstanceKey,
  generatePendingPlaceKey,
} from "./flow-net-keys.js";
import {
  flowNetPathKey,
  formatFlowNetPath,
  isSameFlowNetPath,
  startFlowNetRun,
} from "./interpret-flow-net.js";
import {
  fileFlowDefinition,
  forEachFlowDefinition,
  hardcodedFlowDefinitions,
} from "./testing/flow-definitions.js";

import type { FlowNetMetadata } from "./flow-net-metadata.js";
import type {
  FlowNetAwaiting,
  FlowNetOutcome,
  FlowNetPath,
  FlowNetPlacedToken,
  FlowNetRun,
} from "./interpret-flow-net.js";
import type {
  ActualModeMarking,
  ArcEndpoint,
  SDCPN,
} from "@hashintel/petrinaut-core";
import type {
  FlowActionDefinitionId,
  FlowDefinition,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";

const placeAt = (key: string): FlowNetPath => [toPetrinautId(key)];

const tokensAt = (run: FlowNetRun, path: FlowNetPath) =>
  run
    .marking()
    .filter((placed) => isSameFlowNetPath(placed.path, path))
    .map(({ token }) => token);

const endpointPath = (endpoint: ArcEndpoint): FlowNetPath =>
  endpoint.kind === "place"
    ? [endpoint.placeId]
    : [endpoint.componentInstanceId, endpoint.portPlaceId];

const flowOutputPath = (net: SDCPN, outputName: string) => {
  const endpoint = (net.metadata as FlowNetMetadata).flowOutputs[outputName];

  if (!endpoint) {
    throw new Error(`The net has no flow output "${outputName}"`);
  }

  return endpointPath(endpoint);
};

/** The action each action step of a definition runs, including steps inside `forEach` steps. */
const actionsByStepId = (flowDefinition: FlowDefinition) => {
  const byStepId = new Map<string, FlowActionDefinitionId>();

  const add = (steps: StepDefinition[]) => {
    for (const step of steps) {
      if (step.kind === "action") {
        byStepId.set(step.stepId, step.actionDefinitionId);
      } else {
        add(step.steps);
      }
    }
  };

  add(flowDefinition.steps);

  return byStepId;
};

const allStepIds = (steps: StepDefinition[]): string[] =>
  steps.flatMap((step) => [
    step.stepId,
    ...(step.kind === "for-each" ? allStepIds(step.steps) : []),
  ]);

/**
 * Applies the outcome `decide` gives for whatever the run waits on first (or last), until it waits on nothing.
 * Taking the last runs later items first.
 */
const runToEnd = (
  run: FlowNetRun,
  decide: (awaiting: FlowNetAwaiting) => FlowNetOutcome,
  { take = "first" }: { take?: "first" | "last" } = {},
) => {
  for (let applied = 0; ; applied++) {
    const waitingOn = run.awaiting();

    for (const awaiting of waitingOn) {
      expect(run.isAwaitingStart(awaiting.stepRun)).toBe(
        awaiting.kind === "stepStart",
      );
      expect(run.awaitedAttempt(awaiting.stepRun)).toBe(
        awaiting.kind === "actionOutcome" ? awaiting.attempt : null,
      );
    }

    const next = take === "first" ? waitingOn[0] : waitingOn.at(-1);

    if (!next) {
      return;
    }

    if (applied > 100_000) {
      throw new Error("The run never ends");
    }

    run.apply(decide(next));
  }
};

/**
 * Starts every step waiting to start, succeeds every attempt with all of its action's outputs, and gives every
 * `forEach` step `itemCount` items.
 */
const succeedingEverything =
  (flowDefinition: FlowDefinition, { itemCount = 3 } = {}) =>
  (awaiting: FlowNetAwaiting): FlowNetOutcome => {
    if (awaiting.kind === "itemCount") {
      return { kind: "itemCount", stepRun: awaiting.stepRun, itemCount };
    }

    if (awaiting.kind === "stepStart") {
      return { kind: "stepStarted", stepRun: awaiting.stepRun };
    }

    const actionDefinitionId = actionsByStepId(flowDefinition).get(
      awaiting.stepRun.stepId,
    )!;

    return {
      kind: "attemptSucceeded",
      stepRun: awaiting.stepRun,
      outputNames: actionDefinitions[actionDefinitionId].outputs.map(
        ({ name }) => name,
      ),
    };
  };

/**
 * Checks each firing takes from the places its transition's standard arcs point at, reads from those its read arcs
 * point at, and puts a token where each output arc points.
 */
const expectFiringsFollowArcs = (net: SDCPN, run: FlowNetRun) => {
  for (const firing of run.firings) {
    const { transitionPath } = firing;

    expect(transitionPath.length).toBeLessThanOrEqual(2);

    const [instanceId, transitionId] =
      transitionPath.length === 2
        ? transitionPath
        : [undefined, transitionPath[0]];
    const instance = instanceId
      ? net.componentInstances?.find(({ id }) => id === instanceId)
      : undefined;
    const transition = (
      instance
        ? net.subnets?.find(({ id }) => id === instance.subnetId)?.transitions
        : net.transitions
    )?.find(({ id }) => id === transitionId);

    if (!transition) {
      throw new Error(
        `Firing of unknown transition ${formatFlowNetPath(transitionPath)}`,
      );
    }

    const pathKeyOf = (endpoint: ArcEndpoint) =>
      flowNetPathKey(
        instance && endpoint.kind === "place"
          ? [instance.id, endpoint.placeId]
          : endpointPath(endpoint),
      );

    const arcsOfType = (type: "standard" | "read") =>
      transition.inputArcs
        .filter((arc) => arc.type === type)
        .map((arc) => pathKeyOf(getArcEndpoint(arc)))
        .sort();

    expect(
      firing.consumed.map(({ path }) => flowNetPathKey(path)).sort(),
    ).toEqual(arcsOfType("standard"));
    expect(firing.read.map(({ path }) => flowNetPathKey(path)).sort()).toEqual(
      arcsOfType("read"),
    );
    expect(firing.produced.map(({ path }) => flowNetPathKey(path))).toEqual(
      transition.outputArcs.map((arc) => pathKeyOf(getArcEndpoint(arc))),
    );

    /* A firing only takes tokens of its own item or an enclosing one, except an item's output that it collects. */
    for (const { token } of [...firing.consumed, ...firing.read]) {
      const itemPath =
        firing.role === "collectItem" && token.kind !== "accumulator"
          ? token.itemPath.slice(0, -1)
          : token.itemPath;

      expect(firing.stepRun.itemPath.slice(0, itemPath.length)).toEqual(
        itemPath,
      );
    }
  }
};

const countByPath = (placedTokens: readonly FlowNetPlacedToken[]) => {
  const counts: Record<string, number> = {};

  for (const { path } of placedTokens) {
    const key = flowNetPathKey(path);

    counts[key] = (counts[key] ?? 0) + 1;
  }

  return counts;
};

/**
 * Applies the run's firings with Petrinaut's Actual Mode code, from its initial marking: no firing may take a token
 * that isn't there, and the result must be the run's marking.
 */
const expectActualModeReplays = (run: FlowNetRun) => {
  let marking: ActualModeMarking = countByPath(run.initialMarking);

  for (const [index, firing] of run.firings.entries()) {
    marking = applyActualModeTransitionFiring(marking, {
      transitionId: flowNetPathKey(firing.transitionPath),
      input: countByPath(firing.consumed),
      output: countByPath(firing.produced),
      ts: new Date(index).toISOString(),
    });

    for (const [position, count] of Object.entries(marking)) {
      if (typeof count !== "number" || count < 0) {
        throw new Error(
          `Firing ${index} (${firing.role} of ${firing.stepRun.stepId}) left ${JSON.stringify(count)} tokens at ${position}`,
        );
      }
    }
  }

  expect(
    Object.fromEntries(
      Object.entries(marking).filter(([, count]) => count !== 0),
    ),
  ).toEqual(countByPath(run.marking()));
};

const leftoverKinds = (run: FlowNetRun) =>
  new Set(run.marking().map(({ token }) => token.kind));

describe("flow net paths", () => {
  const placeId = toPetrinautId("p.place");
  const instanceId = toPetrinautId(generateInstanceKey("a"));
  const otherInstanceId = toPetrinautId(generateInstanceKey("b"));

  it("keys a root place apart from the place with its id in an instance", () => {
    expect(flowNetPathKey([placeId])).not.toBe(
      flowNetPathKey([instanceId, placeId]),
    );
    expect(isSameFlowNetPath([placeId], [instanceId, placeId])).toBe(false);
  });

  it("keys the same place in two instances apart", () => {
    expect(flowNetPathKey([instanceId, placeId])).not.toBe(
      flowNetPathKey([otherInstanceId, placeId]),
    );
    expect(
      isSameFlowNetPath([instanceId, placeId], [otherInstanceId, placeId]),
    ).toBe(false);
  });

  it("keys equal paths alike", () => {
    expect(flowNetPathKey([instanceId, placeId])).toBe(
      flowNetPathKey([instanceId, placeId]),
    );
    expect(
      isSameFlowNetPath([instanceId, placeId], [instanceId, placeId]),
    ).toBe(true);
    expect(isSameFlowNetPath([instanceId], [instanceId, placeId])).toBe(false);
  });

  it("writes a path with dots", () => {
    expect(formatFlowNetPath([instanceId, placeId])).toBe(
      `${instanceId}.${placeId}`,
    );
  });

  it("keeps apart two steps' tokens in the places their action's subnet shares", async () => {
    const net = await compileFlowDefinition(
      defineFlow(
        {
          flowDefinitionId: "get-two-files",
          name: "Get two files",
          description: "Get two files from one URL",
          inputs: { url: flowInput("Text") },
        },
        ({ inputs, step }) => {
          const first = step("first", actions.getFileFromUrl, {
            description: "Retrieve the file from the URL",
            inputs: { url: inputs.url },
          });
          const second = step("second", actions.getFileFromUrl, {
            description: "Retrieve the file from the URL again",
            inputs: { url: inputs.url },
          });

          return {
            outputs: {
              first: first.outputs.fileEntity,
              second: second.outputs.fileEntity,
            },
          };
        },
      ).flowDefinition,
    );
    const run = startFlowNetRun(net, { flowInputNames: ["url"] });

    const attempts = run
      .marking()
      .filter(({ token }) => token.kind === "attempt")
      .map(({ path }) => path);

    expect(attempts).toHaveLength(2);

    const [firstAttempt, secondAttempt] = attempts as [
      FlowNetPath,
      FlowNetPath,
    ];

    expect(firstAttempt.at(-1)).toBe(secondAttempt.at(-1));
    expect(new Set([firstAttempt[0], secondAttempt[0]])).toEqual(
      new Set([
        toPetrinautId(generateInstanceKey("first")),
        toPetrinautId(generateInstanceKey("second")),
      ]),
    );
    expect(flowNetPathKey(firstAttempt)).not.toBe(
      flowNetPathKey(secondAttempt),
    );
    expect(tokensAt(run, firstAttempt)).toHaveLength(1);
    expect(tokensAt(run, secondAttempt)).toHaveLength(1);
  });
});

describe("startFlowNetRun", () => {
  it("starts a step once its inputs are there, and waits for its action", async () => {
    const net = await compileFlowDefinition(fileFlowDefinition);
    const run = startFlowNetRun(net, { flowInputNames: ["url"] });

    expect(run.firings.map(({ role }) => role)).toEqual([
      "startStep",
      "startAttempt",
    ]);
    expect(run.awaiting()).toEqual([
      {
        kind: "actionOutcome",
        stepRun: { stepId: "get", itemPath: [] },
        attempt: 1,
      },
    ]);

    /* Optional inputs nothing is connected to get a token marked absent. */
    const [startStep] = run.firings;

    expect(
      startStep?.produced.map(({ token }) =>
        token.kind === "value" ? token.present : token.kind,
      ),
    ).toEqual(actions.getFileFromUrl.inputs.map(({ name }) => name === "url"));
  });

  it("puts an action's outputs in its instance's output ports", async () => {
    const net = await compileFlowDefinition(fileFlowDefinition);
    const run = startFlowNetRun(net, { flowInputNames: ["url"] });

    const firings = run.apply({
      kind: "attemptSucceeded",
      stepRun: { stepId: "get", itemPath: [] },
      outputNames: ["fileEntity"],
    });

    expect(firings.map(({ role }) => role)).toEqual(["succeedAttempt"]);
    expect(run.awaiting()).toEqual([]);

    const fileOutput = flowOutputPath(net, "file");

    expect(fileOutput).toEqual([
      toPetrinautId(generateInstanceKey("get")),
      expect.any(String),
    ]);
    expect(tokensAt(run, fileOutput)).toEqual([
      {
        kind: "value",
        present: true,
        ref: {
          kind: "stepOutput",
          stepId: "get",
          outputName: "fileEntity",
          itemPath: [],
        },
        itemPath: [],
      },
    ]);
    expectFiringsFollowArcs(net, run);
    expectActualModeReplays(run);
  });

  it("retries a failed attempt, and records a step that gives up", async () => {
    const net = await compileFlowDefinition(fileFlowDefinition);
    const run = startFlowNetRun(net, { flowInputNames: ["url"] });
    const stepRun = { stepId: "get", itemPath: [] };

    expect(
      run
        .apply({ kind: "attemptFailed", stepRun, retrying: true })
        .map(({ role }) => role),
    ).toEqual(["failAttempt", "retryAttempt"]);
    expect(run.awaiting()).toEqual([
      { kind: "actionOutcome", stepRun, attempt: 2 },
    ]);

    expect(
      run
        .apply({ kind: "attemptFailed", stepRun, retrying: false })
        .map(({ role }) => role),
    ).toEqual(["failAttempt", "giveUp", "recordStepFailure"]);
    expect(run.awaiting()).toEqual([]);
    expect(tokensAt(run, placeAt(failedStepRunsPlaceKey))).toEqual([
      { kind: "stepFailure", stepId: "get", itemPath: [] },
    ]);
    expectFiringsFollowArcs(net, run);
    expectActualModeReplays(run);
  });

  it("refuses an outcome the net isn't waiting for", async () => {
    const net = await compileFlowDefinition(fileFlowDefinition);
    const run = startFlowNetRun(net, { flowInputNames: ["url"] });

    expect(() =>
      run.apply({
        kind: "attemptSucceeded",
        stepRun: { stepId: "get", itemPath: [0] },
        outputNames: [],
      }),
    ).toThrow("has no attempt in progress");
    expect(() =>
      run.apply({
        kind: "itemCount",
        stepRun: { stepId: "get", itemPath: [] },
        itemCount: 1,
      }),
    ).toThrow("isn't waiting to start");
  });

  it("runs a forEach step's items and collects their outputs", async () => {
    const net = await compileFlowDefinition(forEachFlowDefinition);
    const run = startFlowNetRun(net, { flowInputNames: ["urls"] });

    expect(run.awaiting()).toEqual([
      { kind: "itemCount", stepRun: { stepId: "each", itemPath: [] } },
    ]);

    run.apply({
      kind: "itemCount",
      stepRun: { stepId: "each", itemPath: [] },
      itemCount: 2,
    });

    expect(run.awaiting()).toEqual([
      {
        kind: "actionOutcome",
        stepRun: { stepId: "get", itemPath: [0] },
        attempt: 1,
      },
      {
        kind: "actionOutcome",
        stepRun: { stepId: "get", itemPath: [1] },
        attempt: 1,
      },
    ]);

    for (const index of [1, 0]) {
      run.apply({
        kind: "attemptSucceeded",
        stepRun: { stepId: "get", itemPath: [index] },
        outputNames: ["fileEntity"],
      });
    }

    expect(
      run.firings
        .filter(({ stepRun }) => stepRun.stepId === "each")
        .map(({ role }) => role),
    ).toEqual([
      "startForEach",
      "startItem",
      "startItem",
      "startCollecting",
      "collectItem",
      "collectItem",
      "finishCollecting",
    ]);
    expect(tokensAt(run, flowOutputPath(net, "files"))).toEqual([
      {
        kind: "value",
        present: true,
        ref: { kind: "collected", forEachStepId: "each", itemPath: [] },
        itemPath: [],
      },
    ]);
    expectFiringsFollowArcs(net, run);
    expectActualModeReplays(run);
  });

  it("finishes a forEach step with no items at once", async () => {
    const net = await compileFlowDefinition(forEachFlowDefinition);
    const run = startFlowNetRun(net, { flowInputNames: ["urls"] });

    expect(
      run
        .apply({
          kind: "itemCount",
          stepRun: { stepId: "each", itemPath: [] },
          itemCount: 0,
        })
        .map(({ role }) => role),
    ).toEqual(["startForEach", "startCollecting", "finishCollecting"]);
    expect(run.awaiting()).toEqual([]);
  });

  it("starts a step whose inputs read the same value", async () => {
    const net = await compileFlowDefinition(
      defineFlow(
        {
          flowDefinitionId: "get-described-file",
          name: "Get described file",
          description: "Get a file, described by its URL",
          inputs: { url: flowInput("Text") },
        },
        ({ inputs, step }) => {
          const getFile = step("get", actions.getFileFromUrl, {
            description: "Retrieve the file from the URL",
            inputs: { url: inputs.url, description: inputs.url },
          });

          return { outputs: { file: getFile.outputs.fileEntity } };
        },
      ).flowDefinition,
    );
    const run = startFlowNetRun(net, { flowInputNames: ["url"] });

    expect(run.firings.map(({ role }) => role)).toEqual([
      "startStep",
      "startAttempt",
    ]);

    const [startStep] = run.firings;

    expect(startStep?.read).toHaveLength(2);
    expect(new Set(startStep?.read.map(({ token }) => token)).size).toBe(1);
    expectFiringsFollowArcs(net, run);
    expectActualModeReplays(run);
  });

  it("waits for an action step to be told it started, when told to wait", async () => {
    const net = await compileFlowDefinition(forEachFlowDefinition);
    const run = startFlowNetRun(net, {
      flowInputNames: ["urls"],
      waitForStepStarts: true,
    });

    run.apply({
      kind: "itemCount",
      stepRun: { stepId: "each", itemPath: [] },
      itemCount: 2,
    });

    expect(run.awaiting()).toEqual([
      { kind: "stepStart", stepRun: { stepId: "get", itemPath: [0] } },
      { kind: "stepStart", stepRun: { stepId: "get", itemPath: [1] } },
    ]);

    expect(
      run
        .apply({
          kind: "stepStarted",
          stepRun: { stepId: "get", itemPath: [1] },
        })
        .map(({ role, stepRun }) => [role, stepRun.itemPath]),
    ).toEqual([
      ["startStep", [1]],
      ["startAttempt", [1]],
    ]);
    expect(run.isPending({ stepId: "get", itemPath: [0] })).toBe(true);
    expect(run.awaiting()).toEqual([
      {
        kind: "actionOutcome",
        stepRun: { stepId: "get", itemPath: [1] },
        attempt: 1,
      },
      { kind: "stepStart", stepRun: { stepId: "get", itemPath: [0] } },
    ]);
    expect(() =>
      run.apply({
        kind: "stepStarted",
        stepRun: { stepId: "get", itemPath: [1] },
      }),
    ).toThrow("isn't waiting to start");
  });

  it("holds a step whose value to skip on is missing", async () => {
    const net = await compileFlowDefinition(
      defineFlow(
        {
          flowDefinitionId: "maybe-get-file",
          name: "Maybe get file",
          description: "Get a file, if there's a URL",
          inputs: { url: flowInput("Text", { required: false }) },
        },
        ({ inputs, step }) => {
          const getFile = step("get", actions.getFileFromUrl, {
            description: "Retrieve the file from the URL",
            inputs: { url: inputs.url.orSkip() },
          });

          return { outputs: { file: getFile.outputs.fileEntity } };
        },
      ).flowDefinition,
    );

    const withoutUrl = startFlowNetRun(net, { flowInputNames: [] });

    expect(withoutUrl.firings).toEqual([]);
    expect(withoutUrl.isPending({ stepId: "get", itemPath: [] })).toBe(true);
    expect(withoutUrl.awaiting()).toEqual([]);

    const withUrl = startFlowNetRun(net, { flowInputNames: ["url"] });

    expect(withUrl.isPending({ stepId: "get", itemPath: [] })).toBe(false);
  });

  it("doesn't hold a step whose optional input to skip on is missing", async () => {
    const net = await compileFlowDefinition(
      defineFlow(
        {
          flowDefinitionId: "get-file-maybe-described",
          name: "Get file, maybe described",
          description: "Get a file, with a description if there is one",
          inputs: {
            url: flowInput("Text"),
            description: flowInput("Text", { required: false }),
          },
        },
        ({ inputs, step }) => {
          const getFile = step("get", actions.getFileFromUrl, {
            description: "Retrieve the file from the URL",
            inputs: {
              url: inputs.url,
              description: inputs.description.orSkip(),
            },
          });

          return { outputs: { file: getFile.outputs.fileEntity } };
        },
      ).flowDefinition,
    );

    const run = startFlowNetRun(net, { flowInputNames: ["url"] });

    expect(run.isPending({ stepId: "get", itemPath: [] })).toBe(false);
  });

  describe.each(hardcodedFlowDefinitions)(
    "the %s flow",
    (_, flowDefinition) => {
      const flowInputNames = flowDefinition.inputs.map(({ name }) => name);

      /** Checks a run that ran to its end left nothing behind but values, and no failures. */
      const expectCompleted = (net: SDCPN, run: FlowNetRun) => {
        expect(run.awaiting()).toEqual([]);

        for (const kind of leftoverKinds(run)) {
          expect(["value", "signal"]).toContain(kind);
        }

        for (const stepId of allStepIds(flowDefinition.steps)) {
          expect(
            tokensAt(run, placeAt(generatePendingPlaceKey(stepId))),
          ).toEqual([]);
        }

        for (const { name } of flowDefinition.outputs) {
          expect(tokensAt(run, flowOutputPath(net, name))).toContainEqual(
            expect.objectContaining({ kind: "value", present: true }),
          );
        }

        expectFiringsFollowArcs(net, run);
        expectActualModeReplays(run);
      };

      it("ends with its outputs when every step succeeds", async () => {
        const net = await compileFlowDefinition(flowDefinition);
        const run = startFlowNetRun(net, { flowInputNames });

        runToEnd(run, succeedingEverything(flowDefinition));

        expectCompleted(net, run);
      });

      it("ends with its outputs when every step fails once, then succeeds, later items first", async () => {
        const net = await compileFlowDefinition(flowDefinition);
        const run = startFlowNetRun(net, { flowInputNames });
        const succeed = succeedingEverything(flowDefinition);

        runToEnd(
          run,
          (awaiting) =>
            awaiting.kind === "actionOutcome" && awaiting.attempt === 1
              ? {
                  kind: "attemptFailed",
                  stepRun: awaiting.stepRun,
                  retrying: true,
                }
              : succeed(awaiting),
          { take: "last" },
        );

        expectCompleted(net, run);
        expect(
          run.firings.filter(({ role }) => role === "retryAttempt").length,
        ).toBe(
          run.firings.filter(({ role }) => role === "succeedAttempt").length,
        );
      });

      it("ends with its outputs when it waits for each step to start", async () => {
        const net = await compileFlowDefinition(flowDefinition);
        const run = startFlowNetRun(net, {
          flowInputNames,
          waitForStepStarts: true,
        });

        runToEnd(run, succeedingEverything(flowDefinition));

        expectCompleted(net, run);
      });

      it("ends with its outputs when every forEach step has no items", async () => {
        const net = await compileFlowDefinition(flowDefinition);
        const run = startFlowNetRun(net, { flowInputNames });

        runToEnd(run, succeedingEverything(flowDefinition, { itemCount: 0 }));

        expectCompleted(net, run);
      });

      it("records the first step that gives up, and goes no further on it", async () => {
        const net = await compileFlowDefinition(flowDefinition);
        const run = startFlowNetRun(net, { flowInputNames });
        const succeed = succeedingEverything(flowDefinition);
        let gaveUp: string | undefined;

        runToEnd(run, (awaiting) => {
          if (awaiting.kind === "actionOutcome" && gaveUp === undefined) {
            gaveUp = awaiting.stepRun.stepId;

            return {
              kind: "attemptFailed",
              stepRun: awaiting.stepRun,
              retrying: false,
            };
          }

          return succeed(awaiting);
        });

        expect(tokensAt(run, placeAt(failedStepRunsPlaceKey))).toEqual([
          expect.objectContaining({ kind: "stepFailure", stepId: gaveUp }),
        ]);
        expect(leftoverKinds(run)).not.toContain("attempt");
        expectFiringsFollowArcs(net, run);
        expectActualModeReplays(run);
      });
    },
  );
});
