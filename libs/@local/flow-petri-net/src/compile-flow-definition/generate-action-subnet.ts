import {
  generateActionSubnetName,
  generateDonePortKey,
  generateGaveUpPortKey,
  generateInputPortKey,
  generateOutputPortKey,
  generateStartPortKey,
  generateSubnetElementKey,
  generateSubnetKey,
  maxRetriesParameterKey,
  type ResolvedKinds,
} from "../flow-net-keys.js";
import {
  createOneOfPayloadColor,
  createPayloadColor,
  lifecycleColor,
} from "./shared/colors.js";
import { type KernelPlace, withKernel } from "./shared/kernels.js";
import { layOut } from "./shared/lay-out.js";
import { defaultMaxRetries } from "./shared/max-retries.js";
import {
  createPlace,
  createTransition,
  inputArc,
  outputArc,
  placeEndpoint,
} from "./shared/net-elements.js";

import type { SubnetMetadata } from "../flow-net-metadata.js";
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
  { layout = true }: { layout?: boolean } = {},
): Promise<Subnet> => {
  const { actionDefinitionId, name, description, inputs, outputs } =
    actionDefinition;

  const subnetName = generateActionSubnetName(
    actionDefinitionId,
    resolvedKinds,
  );

  const colors = new Map<string, Color>([[lifecycleColor.id, lifecycleColor]]);

  const addColor = (color: Color) => {
    colors.set(color.id, color);
    return color.id;
  };

  const inputPorts =
    inputs.length > 0
      ? inputs.map((input) =>
          createPlace({
            id: generateInputPortKey(subnetName, input.name),
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
            id: generateStartPortKey(subnetName),
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
            id: generateOutputPortKey(subnetName, output.name),
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
            id: generateDonePortKey(subnetName),
            name: "Done",
            description: "The action succeeded (it has no outputs).",
            colorId: lifecycleColor.id,
            isPort: true,
          }),
        ];

  const inProgress = createPlace({
    id: generateSubnetElementKey("p", subnetName, "inProgress"),
    name: "InProgress",
    description: `${name} is running.`,
    colorId: lifecycleColor.id,
  });

  const failed = createPlace({
    id: generateSubnetElementKey("p", subnetName, "failed"),
    name: "Failed",
    description: `An attempt to run ${name} failed.`,
    colorId: lifecycleColor.id,
  });

  const gaveUp = createPlace({
    id: generateGaveUpPortKey(subnetName),
    name: "GaveUp",
    description: `${name} failed on every attempt.`,
    colorId: lifecycleColor.id,
    isPort: true,
  });

  const places = [...inputPorts, inProgress, failed, gaveUp, ...outputPorts];

  const transitions = [
    createTransition({
      id: generateSubnetElementKey("t", subnetName, "startAttempt"),
      name: `Start ${name}`,
      description: `Start running ${name} with the step's inputs.`,
      metadata: { role: "startAttempt" },
      inputArcs: inputPorts.map((port) => inputArc(placeEndpoint(port.id))),
      outputArcs: [outputArc(placeEndpoint(inProgress.id))],
    }),
    createTransition({
      id: generateSubnetElementKey("t", subnetName, "succeedAttempt"),
      name: `${name} succeeded`,
      description: `${name} completed, producing its outputs.`,
      metadata: { role: "succeedAttempt" },
      inputArcs: [inputArc(placeEndpoint(inProgress.id))],
      outputArcs: outputPorts.map((port) => outputArc(placeEndpoint(port.id))),
    }),
    createTransition({
      id: generateSubnetElementKey("t", subnetName, "failAttempt"),
      name: `${name} failed`,
      description: `An attempt to run ${name} failed.`,
      metadata: { role: "failAttempt" },
      inputArcs: [inputArc(placeEndpoint(inProgress.id))],
      outputArcs: [outputArc(placeEndpoint(failed.id))],
    }),
    createTransition({
      id: generateSubnetElementKey("t", subnetName, "retryAttempt"),
      name: `Retry ${name}`,
      description: `Try ${name} again, while fewer than max_retries attempts have been made.`,
      metadata: { role: "retryAttempt" },
      inputArcs: [inputArc(placeEndpoint(failed.id))],
      outputArcs: [outputArc(placeEndpoint(inProgress.id))],
    }),
    createTransition({
      id: generateSubnetElementKey("t", subnetName, "giveUp"),
      name: `Give up on ${name}`,
      description: `Stop trying ${name} once max_retries attempts have failed.`,
      metadata: { role: "giveUp" },
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

  const nodes = {
    places,
    transitions: transitions.map((transition) =>
      withKernel(transition, resolvePlace),
    ),
  };
  const laidOut = layout ? await layOut(nodes) : nodes;

  return {
    id: generateSubnetKey(subnetName),
    name: actionDefinitionId,
    description,
    metadata: { actionDefinitionId } satisfies SubnetMetadata,
    places: laidOut.places,
    transitions: laidOut.transitions,
    types: [...colors.values()],
    differentialEquations: [],
    parameters: [
      {
        id: maxRetriesParameterKey,
        name: "Max retries",
        variableName: "max_retries",
        type: "integer",
        defaultValue: String(defaultMaxRetries),
      },
    ],
    componentInstances: [],
  };
};
