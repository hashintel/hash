import { canonicalizePetrinautIds } from "@hashintel/petrinaut-core";
import { assertValidFlowDefinition } from "@local/hash-isomorphic-utils/flows/validate-flow-definition";

import { compileActionStep } from "./compile-flow-definition/compile-action-step.js";
import { compileForEachStep } from "./compile-flow-definition/compile-for-each-step.js";
import { generateActionSubnet } from "./compile-flow-definition/generate-action-subnet.js";
import {
  pendingColor,
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
  placeEndpoint,
  toPetrinautEndpoint,
} from "./compile-flow-definition/shared/net-elements.js";
import { placeValues } from "./compile-flow-definition/shared/value-places.js";
import {
  failedStepRunsPlaceKey,
  generateActionSubnetName,
  generatePendingPlaceKey,
} from "./flow-net-keys.js";

import type { FlowNetMetadata } from "./flow-net-metadata.js";
import type { ArcEndpoint, SDCPN } from "@hashintel/petrinaut-core";
import type {
  ActionStepDefinition,
  FlowDefinition,
  PayloadKind,
} from "@local/hash-isomorphic-utils/flows/types";

/**
 * Compiles a flow definition into the Petri net that runs it, which Petrinaut can render.
 *
 * - Each flow input is a place. A run starts with a token in each flow input's places, and a `Pending` token for
 *   each top-level step, which the executor puts there: the root's `metadata.flowInputs` and
 *   `metadata.pendingAtStart` say where.
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
 * Transitions carry their role in `metadata.role`, for the executor to interpret. Their kernels are placeholders,
 * which carry `run_id` and `item_path` forward and give every other attribute a default, and the net has no guards,
 * so it builds in Petrinaut but doesn't simulate meaningfully. Every transition added for a step names it in
 * `metadata.stepId`. The root's `metadata.flowOutputs` gives the endpoint each flow output is found at.
 *
 * The result is deterministic, so compiled nets can be compared and stored.
 *
 * @throws if the definition has validation errors.
 */
export const compileFlowDefinition = async (
  unvalidatedFlowDefinition: FlowDefinition,
  {
    layout = true,
  }: {
    /**
     * Whether to position the nodes with Petrinaut's automatic layout. A net that runs rather than one that's shown
     * doesn't need it, and the layout can't run where ELK can't, such as in a Temporal workflow: with `false`, every
     * node is at the origin.
     */
    layout?: boolean;
  } = {},
): Promise<SDCPN> => {
  const flowDefinition = assertValidFlowDefinition(unvalidatedFlowDefinition);

  const steps = indexFlowSteps(flowDefinition);
  const net = createNetBuilder();
  const values = placeValues({ flowDefinition, steps, net });

  for (const { step } of steps.entries) {
    net.addPlace({
      id: generatePendingPlaceKey(step.stepId),
      name: `Pending: ${step.stepId}`,
      description: `Step ${step.stepId} has yet to start.`,
      colorId: pendingColor.id,
    });
  }

  net.addPlace({
    id: failedStepRunsPlaceKey,
    name: "FailedStepRuns",
    description: "Steps that gave up after exhausting their retries.",
    colorId: stepFailureColor.id,
  });

  for (const { step } of steps.entries) {
    if (step.kind === "action") {
      compileActionStep({ step, steps, net, values });
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

      usedSubnets.set(
        generateActionSubnetName(step.actionDefinitionId, resolvedKinds),
        {
          step,
          resolvedKinds,
        },
      );
    }
  }

  const subnets = await Promise.all(
    [...usedSubnets.keys()].sort().map((subnetName) => {
      const { step, resolvedKinds } = usedSubnets.get(subnetName)!;

      return generateActionSubnet(getActionDefinition(step), resolvedKinds, {
        layout,
      });
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

  const nodes = {
    places: net.places,
    transitions: net.transitions.map((transition) =>
      withKernel(transition, resolvePlace, (endpoint) =>
        net.isAbsentInputPort(transition.id, endpoint),
      ),
    ),
    componentInstances: net.componentInstances,
  };
  const laidOut = layout ? await layOut(nodes) : nodes;

  /*
   * The net is built from readable keys (`p.input.prompt`, `t.startStep.1`), and every id is the Petrinaut id
   * (a UUIDv5) of its key, which is what Petrinaut would convert it to when loading the net.
   */
  return canonicalizePetrinautIds({
    description: flowDefinition.description,
    metadata: {
      flowInputs: Object.fromEntries(
        Object.entries(values.flowInputEndpoints).map(([name, endpoints]) => [
          name,
          endpoints.map(toPetrinautEndpoint),
        ]),
      ),
      pendingAtStart: flowDefinition.steps.map(({ stepId }) =>
        toPetrinautEndpoint(placeEndpoint(generatePendingPlaceKey(stepId))),
      ),
      flowOutputs: Object.fromEntries(
        Object.entries(values.flowOutputEndpoints).map(([name, endpoint]) => [
          name,
          toPetrinautEndpoint(endpoint),
        ]),
      ),
    } satisfies FlowNetMetadata,
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
