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
  constant,
  defineFlow,
  flowInput,
} from "@local/hash-isomorphic-utils/flows/define-flow";

import { compileFlowDefinition } from "./compile-flow-definition.js";
import {
  failedStepRunsPlaceKey,
  generateInstanceKey,
  generatePendingPlaceKey,
} from "./flow-net-keys.js";
import { heldRoles, startFlowNetRun } from "./interpret-flow-net.js";
import {
  fileFlowDefinition,
  forEachFlowDefinition,
  hardcodedFlowDefinitions,
} from "./testing/flow-definitions.js";

import type { FlowNetMetadata } from "./flow-net-metadata.js";
import type {
  FlowNetHeldFiring,
  FlowNetHeldRole,
  FlowNetHeldTransition,
  FlowNetPlacedToken,
  FlowNetPosition,
  FlowNetRun,
  FlowNetStepRun,
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

const keyOf = (position: FlowNetPosition) =>
  position.kind === "place"
    ? position.placeId
    : `${position.componentInstanceId}/${position.placeId}`;

const placeAt = (key: string): FlowNetPosition => ({
  kind: "place",
  placeId: toPetrinautId(key),
});

const tokensAt = (run: FlowNetRun, position: FlowNetPosition) =>
  run
    .marking()
    .filter((placed) => keyOf(placed.position) === keyOf(position))
    .map(({ token }) => token);

const endpointPosition = (endpoint: ArcEndpoint): FlowNetPosition =>
  endpoint.kind === "place"
    ? { kind: "place", placeId: endpoint.placeId }
    : {
        kind: "instancePlace",
        componentInstanceId: endpoint.componentInstanceId,
        placeId: endpoint.portPlaceId,
      };

const flowOutputPosition = (net: SDCPN, outputName: string) => {
  const endpoint = (net.metadata as FlowNetMetadata).flowOutputs[outputName];

  if (!endpoint) {
    throw new Error(`The net has no flow output "${outputName}"`);
  }

  return endpointPosition(endpoint);
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

const heldKey = (role: FlowNetHeldRole, { stepId, itemPath }: FlowNetStepRun) =>
  JSON.stringify([role, stepId, itemPath]);

/**
 * Fires what `decide` gives for the first (or last) held transition, until none is held. Taking the last runs later
 * items first.
 */
const runToEnd = (
  run: FlowNetRun,
  decide: (held: FlowNetHeldTransition) => FlowNetHeldFiring,
  { take = "first" }: { take?: "first" | "last" } = {},
) => {
  for (let fired = 0; ; fired++) {
    const held = run.held();
    const heldKeys = new Set(
      held.map(({ role, stepRun }) => heldKey(role, stepRun)),
    );

    for (const transition of held) {
      for (const role of heldRoles) {
        expect(run.isHeld(role, transition.stepRun)).toBe(
          heldKeys.has(heldKey(role, transition.stepRun)),
        );
      }
      expect(run.attemptInProgress(transition.stepRun)).toBe(
        transition.role === "succeedAttempt" ||
          transition.role === "failAttempt"
          ? transition.attempt
          : null,
      );
    }

    const next = take === "first" ? held[0] : held.at(-1);

    if (!next) {
      return;
    }

    if (fired > 100_000) {
      throw new Error("The run never ends");
    }

    run.fire(decide(next));
  }
};

/**
 * Starts every step held from starting, ends every attempt in success with all of its action's outputs, retries a
 * failed one, and gives every `forEach` step `itemCount` items.
 */
const succeedingEverything =
  (flowDefinition: FlowDefinition, { itemCount = 3 } = {}) =>
  (held: FlowNetHeldTransition): FlowNetHeldFiring => {
    const { stepRun } = held;

    switch (held.role) {
      case "startForEach":
        return { role: "startForEach", stepRun, itemCount };
      case "startStep":
        return { role: "startStep", stepRun };
      case "retryAttempt":
      case "giveUp":
        return { role: "retryAttempt", stepRun };
      case "succeedAttempt":
      case "failAttempt": {
        const actionDefinitionId = actionsByStepId(flowDefinition).get(
          stepRun.stepId,
        )!;

        return {
          role: "succeedAttempt",
          stepRun,
          outputNames: actionDefinitions[actionDefinitionId].outputs.map(
            ({ name }) => name,
          ),
        };
      }
    }
  };

/** The held transitions an attempt in progress enables. */
const attemptEnds = (
  stepRun: { stepId: string; itemPath: number[] },
  attempt: number,
) => [
  { role: "succeedAttempt", stepRun, attempt },
  { role: "failAttempt", stepRun, attempt },
];

/**
 * Checks each firing takes from the places its transition's standard arcs point at, reads from those its read arcs
 * point at, and puts a token where each output arc points.
 */
const expectFiringsFollowArcs = (net: SDCPN, run: FlowNetRun) => {
  for (const firing of run.firings) {
    const instance = firing.componentInstanceId
      ? net.componentInstances?.find(
          ({ id }) => id === firing.componentInstanceId,
        )
      : undefined;
    const transition = (
      instance
        ? net.subnets?.find(({ id }) => id === instance.subnetId)?.transitions
        : net.transitions
    )?.find(({ id }) => id === firing.transitionId);

    if (!transition) {
      throw new Error(`Firing of unknown transition ${firing.transitionId}`);
    }

    const positionOf = (endpoint: ArcEndpoint) =>
      keyOf(
        instance && endpoint.kind === "place"
          ? {
              kind: "instancePlace",
              componentInstanceId: instance.id,
              placeId: endpoint.placeId,
            }
          : endpointPosition(endpoint),
      );

    const arcsOfType = (type: "standard" | "read") =>
      transition.inputArcs
        .filter((arc) => arc.type === type)
        .map((arc) => positionOf(getArcEndpoint(arc)))
        .sort();

    expect(
      firing.consumed.map(({ position }) => keyOf(position)).sort(),
    ).toEqual(arcsOfType("standard"));
    expect(firing.read.map(({ position }) => keyOf(position)).sort()).toEqual(
      arcsOfType("read"),
    );
    expect(firing.produced.map(({ position }) => keyOf(position))).toEqual(
      transition.outputArcs.map((arc) => positionOf(getArcEndpoint(arc))),
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

const countByPosition = (placedTokens: readonly FlowNetPlacedToken[]) => {
  const counts: Record<string, number> = {};

  for (const { position } of placedTokens) {
    counts[keyOf(position)] = (counts[keyOf(position)] ?? 0) + 1;
  }

  return counts;
};

/**
 * Applies the run's firings with Petrinaut's Actual Mode code, from its initial marking: no firing may take a token
 * that isn't there, and the result must be the run's marking.
 */
const expectActualModeReplays = (run: FlowNetRun) => {
  let marking: ActualModeMarking = countByPosition(run.initialMarking);

  for (const [index, firing] of run.firings.entries()) {
    marking = applyActualModeTransitionFiring(marking, {
      transitionId: firing.transitionId,
      input: countByPosition(firing.consumed),
      output: countByPosition(firing.produced),
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
  ).toEqual(countByPosition(run.marking()));
};

const leftoverKinds = (run: FlowNetRun) =>
  new Set(run.marking().map(({ token }) => token.kind));

describe("startFlowNetRun", () => {
  it("starts a step once its inputs are there, and holds its attempt's end", async () => {
    const net = await compileFlowDefinition(fileFlowDefinition);
    const run = startFlowNetRun(net, { flowInputNames: ["url"] });
    const stepRun = { stepId: "get", itemPath: [] };

    expect(run.firings.map(({ role }) => role)).toEqual([
      "startStep",
      "startAttempt",
    ]);
    expect(run.held()).toEqual(attemptEnds(stepRun, 1));

    /* Optional inputs nothing is connected to get a token marked absent, which start the action as `null`. */
    const [startStep, startAttempt] = run.firings;

    expect(run.attemptInputs(startAttempt!)).toEqual({
      stepRun,
      inputs: Object.fromEntries(
        actions.getFileFromUrl.inputs.map(({ name }) => [
          name,
          name === "url" ? { kind: "flowInput", inputName: "url" } : null,
        ]),
      ),
    });
    expect(() => run.attemptInputs(startStep!)).toThrow(
      "A startStep firing doesn't start an attempt",
    );
  });

  it("puts an action's outputs in its instance's output ports", async () => {
    const net = await compileFlowDefinition(fileFlowDefinition);
    const run = startFlowNetRun(net, { flowInputNames: ["url"] });

    const firings = run.fire({
      role: "succeedAttempt",
      stepRun: { stepId: "get", itemPath: [] },
      outputNames: ["fileEntity"],
    });

    expect(firings.map(({ role }) => role)).toEqual(["succeedAttempt"]);
    expect(run.held()).toEqual([]);

    const fileOutput = flowOutputPosition(net, "file");

    expect(fileOutput).toMatchObject({
      kind: "instancePlace",
      componentInstanceId: toPetrinautId(generateInstanceKey("get")),
    });
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

    run.fire({ role: "failAttempt", stepRun });

    expect(run.held()).toEqual([
      { role: "retryAttempt", stepRun, attempt: 1 },
      { role: "giveUp", stepRun, attempt: 1 },
    ]);

    run.fire({ role: "retryAttempt", stepRun });

    expect(run.held()).toEqual(attemptEnds(stepRun, 2));

    run.fire({ role: "failAttempt", stepRun });

    expect(
      run.fire({ role: "giveUp", stepRun }).map(({ role }) => role),
    ).toEqual(["giveUp", "recordStepFailure"]);
    expect(run.held()).toEqual([]);
    expect(tokensAt(run, placeAt(failedStepRunsPlaceKey))).toEqual([
      { kind: "stepFailure", stepId: "get", itemPath: [] },
    ]);
    expectFiringsFollowArcs(net, run);
    expectActualModeReplays(run);
  });

  it("refuses to fire a held transition that isn't enabled", async () => {
    const net = await compileFlowDefinition(fileFlowDefinition);
    const run = startFlowNetRun(net, { flowInputNames: ["url"] });

    expect(() =>
      run.fire({
        role: "succeedAttempt",
        stepRun: { stepId: "get", itemPath: [0] },
        outputNames: [],
      }),
    ).toThrow("has no attempt in progress");
    expect(() =>
      run.fire({
        role: "retryAttempt",
        stepRun: { stepId: "get", itemPath: [] },
      }),
    ).toThrow("has no failed attempt");
    expect(() =>
      run.fire({
        role: "startForEach",
        stepRun: { stepId: "get", itemPath: [] },
        itemCount: 1,
      }),
    ).toThrow("can't startForEach now");
  });

  it("runs a forEach step's items and collects their outputs", async () => {
    const net = await compileFlowDefinition(forEachFlowDefinition);
    const run = startFlowNetRun(net, { flowInputNames: ["urls"] });

    expect(run.held()).toEqual([
      { role: "startForEach", stepRun: { stepId: "each", itemPath: [] } },
    ]);

    run.fire({
      role: "startForEach",
      stepRun: { stepId: "each", itemPath: [] },
      itemCount: 2,
    });

    expect(run.held()).toEqual([
      ...attemptEnds({ stepId: "get", itemPath: [0] }, 1),
      ...attemptEnds({ stepId: "get", itemPath: [1] }, 1),
    ]);

    for (const index of [1, 0]) {
      run.fire({
        role: "succeedAttempt",
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
    expect(tokensAt(run, flowOutputPosition(net, "files"))).toEqual([
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
        .fire({
          role: "startForEach",
          stepRun: { stepId: "each", itemPath: [] },
          itemCount: 0,
        })
        .map(({ role }) => role),
    ).toEqual(["startForEach", "startCollecting", "finishCollecting"]);
    expect(run.held()).toEqual([]);
  });

  it("starts a forEach step over a constant array on its own", async () => {
    const net = await compileFlowDefinition(
      defineFlow(
        {
          flowDefinitionId: "get-fixed-files",
          name: "Get fixed files",
          description: "Get a file from each of two fixed URLs",
          inputs: {},
        },
        ({ forEach }) => {
          const files = forEach(
            "each",
            constant("Text", ["https://a.test", "https://b.test"]),
            {
              description: "Retrieve each file",
              collectAs: "files",
              steps: (url, scope) =>
                scope.step("get", actions.getFileFromUrl, {
                  description: "Retrieve the file",
                  inputs: { url },
                }).outputs.fileEntity,
            },
          );

          return { outputs: { files } };
        },
      ).flowDefinition,
    );
    const run = startFlowNetRun(net, { flowInputNames: [] });
    const forEachRun = { stepId: "each", itemPath: [] };

    expect(
      run.firings
        .filter(({ stepRun }) => stepRun.stepId === "each")
        .map(({ role }) => role),
    ).toEqual(["startForEach", "startItem", "startItem", "startCollecting"]);
    expect(run.isHeld("startForEach", forEachRun)).toBe(false);
    expect(run.held()).toEqual([
      ...attemptEnds({ stepId: "get", itemPath: [0] }, 1),
      ...attemptEnds({ stepId: "get", itemPath: [1] }, 1),
    ]);
    expect(() =>
      run.fire({ role: "startForEach", stepRun: forEachRun, itemCount: 2 }),
    ).toThrow("can't startForEach now");
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

  it("holds an action step's start, when told to wait for steps to start", async () => {
    const net = await compileFlowDefinition(forEachFlowDefinition);
    const run = startFlowNetRun(net, {
      flowInputNames: ["urls"],
      waitForStepStarts: true,
    });

    run.fire({
      role: "startForEach",
      stepRun: { stepId: "each", itemPath: [] },
      itemCount: 2,
    });

    expect(run.held()).toEqual([
      { role: "startStep", stepRun: { stepId: "get", itemPath: [0] } },
      { role: "startStep", stepRun: { stepId: "get", itemPath: [1] } },
    ]);

    expect(
      run
        .fire({
          role: "startStep",
          stepRun: { stepId: "get", itemPath: [1] },
        })
        .map(({ role, stepRun }) => [role, stepRun.itemPath]),
    ).toEqual([
      ["startStep", [1]],
      ["startAttempt", [1]],
    ]);
    expect(run.isPending({ stepId: "get", itemPath: [0] })).toBe(true);
    expect(run.held()).toEqual([
      ...attemptEnds({ stepId: "get", itemPath: [1] }, 1),
      { role: "startStep", stepRun: { stepId: "get", itemPath: [0] } },
    ]);
    expect(() =>
      run.fire({
        role: "startStep",
        stepRun: { stepId: "get", itemPath: [1] },
      }),
    ).toThrow("can't startStep now");
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
    expect(withoutUrl.held()).toEqual([]);

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
        expect(run.held()).toEqual([]);

        for (const kind of leftoverKinds(run)) {
          expect(["value", "signal"]).toContain(kind);
        }

        for (const stepId of allStepIds(flowDefinition.steps)) {
          expect(
            tokensAt(run, placeAt(generatePendingPlaceKey(stepId))),
          ).toEqual([]);
        }

        for (const { name } of flowDefinition.outputs) {
          expect(tokensAt(run, flowOutputPosition(net, name))).toContainEqual(
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
          (held) =>
            (held.role === "succeedAttempt" || held.role === "failAttempt") &&
            held.attempt === 1
              ? { role: "failAttempt", stepRun: held.stepRun }
              : succeed(held),
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

        runToEnd(run, (held) => {
          if (
            (held.role === "succeedAttempt" || held.role === "failAttempt") &&
            gaveUp === undefined
          ) {
            gaveUp = held.stepRun.stepId;

            return { role: "failAttempt", stepRun: held.stepRun };
          }

          if (held.role === "retryAttempt" || held.role === "giveUp") {
            return { role: "giveUp", stepRun: held.stepRun };
          }

          return succeed(held);
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
