import {
  actionSubnetId,
  actionSubnetKey,
  defaultMaxRetries,
  donePortId,
  gaveUpPortId,
  inputPortId,
  maxRetriesParameterId,
  outputPortId,
  type ResolvedKinds,
  startPortId,
  subnetItemId,
} from "./shared/action-subnet-ids.js";
import {
  createOneOfPayloadColor,
  createPayloadColor,
  lifecycleColor,
} from "./shared/colors.js";
import { type KernelPlace, withKernel } from "./shared/kernels.js";
import { layOut } from "./shared/lay-out.js";
import {
  createPlace,
  createTransition,
  inputArc,
  outputArc,
  placeEndpoint,
} from "./shared/net-elements.js";

import type { ArcEndpoint, Color, Subnet } from "@hashintel/petrinaut-core";
import type {
  ActionDefinition,
  FlowActionDefinitionId,
} from "@local/hash-isomorphic-utils/flows/types";

/**
 * The colour a port is typed by. An input or output that takes its kind from an input (`kindFrom`), or that a
 * `kindFrom` names, has the step's resolved kind. Any other input accepting several kinds has a `oneOf` colour
 * of them, whose tokens say which kind they carry.
 */
const portColor = (
  definition:
    | ActionDefinition<FlowActionDefinitionId>["inputs"][number]
    | ActionDefinition<FlowActionDefinitionId>["outputs"][number],
  resolvedKinds: ResolvedKinds,
): Color => {
  if ("kindFrom" in definition) {
    const kind = resolvedKinds[definition.kindFrom];

    if (kind === undefined) {
      throw new Error(
        `"${definition.name}" takes the kind of input "${definition.kindFrom}", which isn't resolved`,
      );
    }

    return createPayloadColor(kind, definition.array);
  }

  if ("payloadKind" in definition) {
    return createPayloadColor(definition.payloadKind, definition.array);
  }

  const resolvedKind = resolvedKinds[definition.name];

  if (resolvedKind !== undefined) {
    return createPayloadColor(resolvedKind, definition.array);
  }

  const [onlyKind, ...otherKinds] = definition.oneOfPayloadKinds;

  if (onlyKind === undefined) {
    throw new Error(`Input "${definition.name}" accepts no payload kinds`);
  }

  return otherKinds.length === 0
    ? createPayloadColor(onlyKind, definition.array)
    : createOneOfPayloadColor(definition.oneOfPayloadKinds, definition.array);
};

/**
 * Generates the subnet an action's steps are instances of: a port per input and per output, and the lifecycle
 * of one attempt to run the action.
 *
 * - Every input port receives a token when a step starts – the value's reference, or a token with `present`
 *   false for an optional input that isn't connected – so `startAttempt` consumes one token from each.
 * - `succeedAttempt` puts a token in every output port (with `present` false for an optional output the action didn't
 *   produce). `failAttempt` and `retryAttempt` loop until `giveUp`, bounded by the `max_retries` parameter.
 */
export const generateActionSubnet = async (
  actionDefinition: ActionDefinition<FlowActionDefinitionId>,
  resolvedKinds: ResolvedKinds = {},
): Promise<Subnet> => {
  const { actionDefinitionId, name, description, inputs, outputs } =
    actionDefinition;

  const subnetKey = actionSubnetKey(actionDefinitionId, resolvedKinds);

  const colors = new Map<string, Color>([[lifecycleColor.id, lifecycleColor]]);

  const addColor = (color: Color) => {
    colors.set(color.id, color);
    return color.id;
  };

  const inputPorts =
    inputs.length > 0
      ? inputs.map((input) =>
          createPlace({
            id: inputPortId(subnetKey, input.name),
            name: input.name,
            description: [
              input.description ?? `The ${input.name} input.`,
              input.required ? "Required." : "Optional.",
            ].join(" "),
            colorId: addColor(portColor(input, resolvedKinds)),
            isPort: true,
          }),
        )
      : [
          createPlace({
            id: startPortId(subnetKey),
            name: "Start",
            description: "Starts the action (it has no inputs).",
            colorId: lifecycleColor.id,
            isPort: true,
          }),
        ];

  const outputPorts =
    outputs.length > 0
      ? outputs.map((output) =>
          createPlace({
            id: outputPortId(subnetKey, output.name),
            name: output.name,
            description: [
              output.description ?? `The ${output.name} output.`,
              output.required ? "Always produced." : "May be missing.",
            ].join(" "),
            colorId: addColor(portColor(output, resolvedKinds)),
            isPort: true,
          }),
        )
      : [
          createPlace({
            id: donePortId(subnetKey),
            name: "Done",
            description: "The action succeeded (it has no outputs).",
            colorId: lifecycleColor.id,
            isPort: true,
          }),
        ];

  const inProgress = createPlace({
    id: subnetItemId("p", subnetKey, "inProgress"),
    name: "InProgress",
    description: `${name} is running.`,
    colorId: lifecycleColor.id,
  });

  const failed = createPlace({
    id: subnetItemId("p", subnetKey, "failed"),
    name: "Failed",
    description: `An attempt to run ${name} failed.`,
    colorId: lifecycleColor.id,
  });

  const gaveUp = createPlace({
    id: gaveUpPortId(subnetKey),
    name: "GaveUp",
    description: `${name} failed on every attempt.`,
    colorId: lifecycleColor.id,
    isPort: true,
  });

  const places = [...inputPorts, inProgress, failed, gaveUp, ...outputPorts];

  const transitions = [
    createTransition({
      id: subnetItemId("t", subnetKey, "startAttempt"),
      name: `Start ${name}`,
      description: `Start running ${name} with the step's inputs.`,
      role: "startAttempt",
      inputArcs: inputPorts.map((port) => inputArc(placeEndpoint(port.id))),
      outputArcs: [outputArc(placeEndpoint(inProgress.id))],
    }),
    createTransition({
      id: subnetItemId("t", subnetKey, "succeedAttempt"),
      name: `${name} succeeded`,
      description: `${name} completed, producing its outputs.`,
      role: "succeedAttempt",
      inputArcs: [inputArc(placeEndpoint(inProgress.id))],
      outputArcs: outputPorts.map((port) => outputArc(placeEndpoint(port.id))),
    }),
    createTransition({
      id: subnetItemId("t", subnetKey, "failAttempt"),
      name: `${name} failed`,
      description: `An attempt to run ${name} failed.`,
      role: "failAttempt",
      inputArcs: [inputArc(placeEndpoint(inProgress.id))],
      outputArcs: [outputArc(placeEndpoint(failed.id))],
    }),
    createTransition({
      id: subnetItemId("t", subnetKey, "retryAttempt"),
      name: `Retry ${name}`,
      description: `Try ${name} again, while fewer than max_retries attempts have been made.`,
      role: "retryAttempt",
      inputArcs: [inputArc(placeEndpoint(failed.id))],
      outputArcs: [outputArc(placeEndpoint(inProgress.id))],
    }),
    createTransition({
      id: subnetItemId("t", subnetKey, "giveUp"),
      name: `Give up on ${name}`,
      description: `Stop trying ${name} once max_retries attempts have failed.`,
      role: "giveUp",
      inputArcs: [inputArc(placeEndpoint(failed.id))],
      outputArcs: [outputArc(placeEndpoint(gaveUp.id))],
    }),
  ];

  const placesById = new Map(places.map((place) => [place.id, place]));

  const resolvePlace = (endpoint: ArcEndpoint): KernelPlace => {
    const place =
      endpoint.kind === "place" ? placesById.get(endpoint.placeId) : undefined;
    const color = place?.colorId ? colors.get(place.colorId) : undefined;

    if (!place || !color) {
      throw new Error(
        `Subnet for ${actionDefinitionId} has an arc to an unknown place`,
      );
    }

    return { name: place.name, color };
  };

  const laidOut = await layOut({
    places,
    transitions: transitions.map((transition) =>
      withKernel(transition, resolvePlace),
    ),
  });

  return {
    id: actionSubnetId(subnetKey),
    name: actionDefinitionId,
    description,
    metadata: { actionDefinitionId },
    places: laidOut.places,
    transitions: laidOut.transitions,
    types: [...colors.values()],
    differentialEquations: [],
    parameters: [
      {
        id: maxRetriesParameterId,
        name: "Max retries",
        variableName: "max_retries",
        type: "integer",
        defaultValue: String(defaultMaxRetries),
      },
    ],
    componentInstances: [],
  };
};
