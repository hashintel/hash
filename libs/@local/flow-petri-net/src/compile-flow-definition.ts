import { canonicalizePetrinautIds } from "@hashintel/petrinaut-core";
import { assertValidFlowDefinition } from "@local/hash-isomorphic-utils/flows/validate-flow-definition";

import { compileActionStep } from "./compile-flow-definition/compile-action-step.js";
import { compileForEachStep } from "./compile-flow-definition/compile-for-each-step.js";
import { generateActionSubnet } from "./compile-flow-definition/generate-action-subnet.js";
import { actionSubnetKey } from "./compile-flow-definition/shared/action-subnet-ids.js";
import {
  pendingColor,
  runRequestColor,
  stepFailureColor,
} from "./compile-flow-definition/shared/colors.js";
import {
  getActionDefinition,
  indexFlowSteps,
} from "./compile-flow-definition/shared/flow-steps.js";
import {
  type KernelPlace,
  withKernel,
} from "./compile-flow-definition/shared/kernels.js";
import { layOut } from "./compile-flow-definition/shared/lay-out.js";
import { createNetBuilder } from "./compile-flow-definition/shared/net-builder.js";
import {
  createTransition,
  inputArc,
  outputArc,
  placeEndpoint,
  toPetrinautEndpoint,
} from "./compile-flow-definition/shared/net-elements.js";
import {
  failedStepRunsPlaceId,
  pendingPlaceId,
} from "./compile-flow-definition/shared/step-places.js";
import {
  inputValueKey,
  placeValues,
} from "./compile-flow-definition/shared/value-places.js";

import type { ArcEndpoint, SDCPN } from "@hashintel/petrinaut-core";
import type {
  ActionStepDefinition,
  FlowDefinition,
  PayloadKind,
} from "@local/hash-isomorphic-utils/flows/types";

/**
 * Compiles a flow definition into the Petri net that runs it, which Petrinaut can render.
 *
 * - Each flow input is a place, seeded by the `startRun` transition when a run starts.
 * - Each action step is an instance of its action's subnet (see `generateActionSubnet`), started by a `startStep`
 *   transition once the step's `Pending` token and its connected inputs are available.
 * - A step's output stays in its instance's output port, where steps that read it read it. A single step that
 *   consumes it takes it from the port. Otherwise a `copyOutput` transition puts it in a place shared by the readers,
 *   and in a copy for each step that consumes it, so consumers never race for a token.
 * - A for-each step iterates over its array with an iterator token, fanning out one item token (and one
 *   `Pending` token per nested step) at a time, and completes once an accumulator has counted every item's
 *   collected output.
 * - A step that gives up puts a token in `FailedStepRuns`.
 *
 * Transitions carry their role in `metadata.role`, for the executor to interpret: the net has no guards or
 * kernels yet, so it doesn't simulate meaningfully. Every transition added for a step names it in
 * `metadata.stepId`. The root's `metadata.flowOutputs` gives the endpoint each flow output is found at.
 *
 * The result is deterministic, so compiled nets can be compared and stored.
 *
 * @throws if the definition has validation errors.
 */
export const compileFlowDefinition = async (
  unvalidatedFlowDefinition: FlowDefinition,
): Promise<SDCPN> => {
  const flowDefinition = assertValidFlowDefinition(unvalidatedFlowDefinition);

  const steps = indexFlowSteps(flowDefinition);
  const net = createNetBuilder();
  const values = placeValues({ flowDefinition, steps, net });

  for (const { step } of steps.entries) {
    net.addPlace({
      id: pendingPlaceId(step.stepId),
      name: `Pending: ${step.stepId}`,
      description: `Step ${step.stepId} has yet to start.`,
      colorId: pendingColor.id,
    });
  }

  net.addPlace({
    id: failedStepRunsPlaceId,
    name: "FailedStepRuns",
    description: "Steps that gave up after exhausting their retries.",
    colorId: stepFailureColor.id,
  });

  const runRequestsPlaceId = net.addPlace({
    id: "p.runRequests",
    name: "RunRequests",
    description: "Requests to run the flow, from any of its triggers.",
    colorId: runRequestColor.id,
  });

  net.addTransitions(
    createTransition({
      id: "t.startRun",
      name: "Start run",
      description:
        "Starts a run: puts the flow's inputs in place, and marks each top-level step as pending.",
      role: "startRun",
      inputArcs: [inputArc(placeEndpoint(runRequestsPlaceId))],
      outputArcs: [
        ...flowDefinition.inputs.flatMap(({ name }) =>
          values.valueOutputArcs(inputValueKey(name)),
        ),
        ...flowDefinition.steps.map(({ stepId }) =>
          outputArc(placeEndpoint(pendingPlaceId(stepId))),
        ),
      ],
    }),
  );

  for (const { step, scope } of steps.entries) {
    if (step.kind === "action") {
      compileActionStep({ step, scope, steps, net, values });
    } else {
      compileForEachStep({ step, steps, net, values });
    }
  }

  /* A subnet per action, or per combination of resolved kinds for an action with derived kinds. */
  const usedSubnets = new Map<
    string,
    { step: ActionStepDefinition; resolvedKinds: Record<string, PayloadKind> }
  >();

  for (const { step } of steps.entries) {
    if (step.kind === "action") {
      const resolvedKinds = steps.getResolvedKinds(step);

      usedSubnets.set(actionSubnetKey(step.actionDefinitionId, resolvedKinds), {
        step,
        resolvedKinds,
      });
    }
  }

  const subnets = await Promise.all(
    [...usedSubnets.keys()].sort().map((subnetKey) => {
      const { step, resolvedKinds } = usedSubnets.get(subnetKey)!;

      return generateActionSubnet(getActionDefinition(step), resolvedKinds);
    }),
  );

  const placesById = new Map(net.places.map((place) => [place.id, place]));
  const instancesById = new Map(
    net.componentInstances.map((instance) => [instance.id, instance]),
  );
  const subnetsById = new Map(subnets.map((subnet) => [subnet.id, subnet]));

  const resolvePlace = (endpoint: ArcEndpoint): KernelPlace => {
    if (endpoint.kind === "place") {
      const place = placesById.get(endpoint.placeId);
      const color = place?.colorId ? net.colors.get(place.colorId) : undefined;

      if (!place || !color) {
        throw new Error(`There is no coloured place "${endpoint.placeId}"`);
      }

      return { name: place.name, color };
    }

    const instance = instancesById.get(endpoint.componentInstanceId);
    const subnet = instance ? subnetsById.get(instance.subnetId) : undefined;
    const port = subnet?.places.find(({ id }) => id === endpoint.portPlaceId);
    const color = port?.colorId
      ? subnet?.types.find(({ id }) => id === port.colorId)
      : undefined;

    if (!instance || !port || !color) {
      throw new Error(
        `There is no port "${endpoint.portPlaceId}" on instance "${endpoint.componentInstanceId}"`,
      );
    }

    /* Kernels address a port of an instance by the instance's and the port's names. */
    return { name: `${instance.name}::${port.name}`, color };
  };

  const laidOut = await layOut({
    places: net.places,
    transitions: net.transitions.map((transition) =>
      withKernel(transition, resolvePlace, (endpoint) =>
        net.isAbsentInputPort(transition.id, endpoint),
      ),
    ),
    componentInstances: net.componentInstances,
  });

  /*
   * The net is built from readable keys (`p.input.prompt`, `t.startStep.1`), and every id is the Petrinaut id
   * (a UUIDv5) of its key, which is what Petrinaut would convert it to when loading the net.
   */
  return canonicalizePetrinautIds({
    description: flowDefinition.description,
    metadata: {
      flowOutputs: Object.fromEntries(
        Object.entries(values.flowOutputEndpoints).map(([name, endpoint]) => [
          name,
          toPetrinautEndpoint(endpoint),
        ]),
      ),
    },
    places: laidOut.places,
    transitions: laidOut.transitions,
    types: [...net.colors.values()],
    differentialEquations: [],
    parameters: [],
    scenarios: [],
    metrics: [],
    subnets,
    componentInstances: laidOut.componentInstances,
  });
};
