import { describe, expect, it } from "vitest";

import {
  applyActualModeTransitionFiring,
  getArcEndpoint,
  isPetrinautId,
} from "@hashintel/petrinaut-core";
import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";

import { compileFlowDefinition } from "./compile-flow-definition.js";
import {
  flattenFlowNet,
  toFlatNetActualModeExecution,
} from "./flatten-flow-net.js";
import { startFlowNetRun } from "./interpret-flow-net.js";
import { hardcodedFlowDefinitions } from "./testing/flow-definitions.js";

import type { FlowNetOutcome, FlowNetRun } from "./interpret-flow-net.js";
import type { FlowRunReplay } from "./replay-flow-run-events.js";
import type { ActualModeMarking, SDCPN } from "@hashintel/petrinaut-core";
import type {
  FlowActionDefinitionId,
  FlowDefinition,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";

const actionStepIds = (
  steps: StepDefinition[],
): [string, FlowActionDefinitionId][] =>
  steps.flatMap((step) =>
    step.kind === "action"
      ? [
          [step.stepId, step.actionDefinitionId] as [
            string,
            FlowActionDefinitionId,
          ],
        ]
      : actionStepIds(step.steps),
  );

/**
 * Runs a flow to its end: every step starts, every `forEach` step has three items, and each attempt succeeds with all
 * of its action's outputs, unless `failFirstAttempts`, when each step fails once first.
 */
const runToEnd = (
  net: SDCPN,
  flowDefinition: FlowDefinition,
  { failFirstAttempts }: { failFirstAttempts: boolean },
): FlowNetRun => {
  const actionsByStepId = new Map(actionStepIds(flowDefinition.steps));
  const run = startFlowNetRun(net, {
    flowInputNames: flowDefinition.inputs.map(({ name }) => name),
    waitForStepStarts: true,
  });

  for (;;) {
    const [awaiting] = run.awaiting();

    if (!awaiting) {
      return run;
    }

    const { stepRun } = awaiting;
    const outcome: FlowNetOutcome =
      awaiting.kind === "itemCount"
        ? { kind: "itemCount", stepRun, itemCount: 3 }
        : awaiting.kind === "stepStart"
          ? { kind: "stepStarted", stepRun }
          : failFirstAttempts && awaiting.attempt === 1
            ? { kind: "attemptFailed", stepRun, retrying: true }
            : {
                kind: "attemptSucceeded",
                stepRun,
                outputNames: actionDefinitions[
                  actionsByStepId.get(stepRun.stepId)!
                ].outputs.map(({ name }) => name),
              };

    run.apply(outcome);
  }
};

/** A run as the replay of its events would give it. */
const asReplay = (run: FlowNetRun): FlowRunReplay => ({
  initialMarking: run.initialMarking,
  firings: run.firings.map((firing, index) => ({
    ...firing,
    eventPosition: `${index}.0`,
    occurredAt: new Date(index * 1000).toISOString(),
  })),
  marking: run.marking(),
  awaiting: run.awaiting(),
  problems: [],
  skippedStepRuns: [],
});

const nonZero = (marking: ActualModeMarking) =>
  Object.fromEntries(
    Object.entries(marking).filter(([, count]) => count !== 0),
  );

const repeatedIds = (counts: Record<string, number>) =>
  Object.entries(counts).flatMap(([placeId, count]) =>
    Array.from({ length: count }, () => placeId),
  );

describe.each(hardcodedFlowDefinitions)(
  "flattening the %s flow",
  (_, flowDefinition) => {
    it("leaves one net of valid, unique ids, with every arc pointing at one of its places", async () => {
      const net = await compileFlowDefinition(flowDefinition);
      const { net: flatNet } = flattenFlowNet(net);

      const ids = [...flatNet.places, ...flatNet.transitions].map(
        ({ id }) => id,
      );

      expect(ids.filter((id) => !isPetrinautId(id))).toEqual([]);
      expect(new Set(ids).size).toBe(ids.length);

      expect(flatNet.componentInstances).toEqual([]);
      expect(flatNet.subnets).toEqual([]);

      const placeIds = new Set(flatNet.places.map(({ id }) => id));

      for (const transition of flatNet.transitions) {
        for (const arc of [...transition.inputArcs, ...transition.outputArcs]) {
          const endpoint = getArcEndpoint(arc);

          expect(endpoint.kind).toBe("place");
          expect(
            endpoint.kind === "place" && placeIds.has(endpoint.placeId),
          ).toBe(true);
        }
      }

      const subnetsById = new Map(
        (net.subnets ?? []).map((subnet) => [subnet.id, subnet]),
      );
      const instances = net.componentInstances ?? [];

      expect(flatNet.places.length).toBe(
        net.places.length +
          instances.reduce(
            (sum, { subnetId }) =>
              sum + subnetsById.get(subnetId)!.places.length,
            0,
          ),
      );
      expect(flatNet.transitions.length).toBe(
        net.transitions.length +
          instances.reduce(
            (sum, { subnetId }) =>
              sum + subnetsById.get(subnetId)!.transitions.length,
            0,
          ),
      );

      /* Every transition keeps its role, and names its step. */
      expect(
        flatNet.transitions.filter(
          ({ metadata }) =>
            typeof metadata?.role !== "string" ||
            typeof metadata.stepId !== "string",
        ),
      ).toEqual([]);
    });

    it.each([
      ["every step succeeds", false],
      ["every step fails once, then succeeds", true],
    ])(
      "replays a run where %s in Actual Mode, inside instances too",
      async (_description, failFirstAttempts) => {
        const net = await compileFlowDefinition(flowDefinition);
        const flat = flattenFlowNet(net);
        const run = runToEnd(net, flowDefinition, { failFirstAttempts });
        const replay = asReplay(run);

        const { initialState, transitionFirings } =
          toFlatNetActualModeExecution(replay, flat);

        const placeIds = new Set(flat.net.places.map(({ id }) => id));
        const transitionsById = new Map(
          flat.net.transitions.map((transition) => [transition.id, transition]),
        );

        expect(
          Object.keys(initialState).filter((id) => !placeIds.has(id)),
        ).toEqual([]);
        expect(transitionFirings).toHaveLength(run.firings.length);

        let marking = initialState;

        for (const [index, firing] of transitionFirings.entries()) {
          const transition = transitionsById.get(firing.transitionId);

          if (!transition) {
            throw new Error(`Firing ${index} is of an unknown transition`);
          }

          /* A firing takes from where its transition's standard arcs point, and puts where its output arcs point. */
          const arcPlaceIds = (arcs: typeof transition.outputArcs) =>
            arcs.map((arc) => {
              const endpoint = getArcEndpoint(arc);

              return endpoint.kind === "place" ? endpoint.placeId : "";
            });

          expect(
            repeatedIds(firing.input as Record<string, number>).sort(),
          ).toEqual(
            arcPlaceIds(
              transition.inputArcs.filter(({ type }) => type === "standard"),
            ).sort(),
          );
          expect(
            repeatedIds(firing.output as Record<string, number>).sort(),
          ).toEqual(arcPlaceIds(transition.outputArcs).sort());

          marking = applyActualModeTransitionFiring(marking, firing);

          for (const [placeId, count] of Object.entries(marking)) {
            if (typeof count !== "number" || count < 0) {
              throw new Error(
                `Firing ${index} (${transition.name}) left ${JSON.stringify(count)} tokens at ${placeId}`,
              );
            }
          }
        }

        const finalMarking: Record<string, number> = {};

        for (const { position } of replay.marking) {
          const placeId = flat.placeId(position);

          finalMarking[placeId] = (finalMarking[placeId] ?? 0) + 1;
        }

        expect(
          Object.keys(finalMarking).filter((id) => !placeIds.has(id)),
        ).toEqual([]);
        expect(nonZero(marking)).toEqual(finalMarking);
      },
    );
  },
);
