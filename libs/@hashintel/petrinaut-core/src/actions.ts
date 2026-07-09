import {
  colorSchema,
  componentInstanceSchema,
  differentialEquationSchema,
  metricSchema,
  parameterSchema,
  mutationActionInputSchemas,
  placeSchema,
  scenarioSchema,
  subnetSchema,
  transitionSchema,
  type MutationActionInput,
} from "./action-schemas";
import {
  arcMatchesEndpoint,
  arcReferencesComponentInstance,
  arcReferencesPlace,
  createArcEndpointReference,
  getArcEndpoint,
  getArcEndpointKey,
  getComponentPortEndpointSubnet,
  placeArcEndpoint,
} from "./arc-endpoints";
import { generateArcId } from "./arc-id";
import { generateDefaultTransitionKernelCode } from "./default-codes";
import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  createArcPlaceResolver,
  getTransitionLogicAvailability,
  sanitizePlaceForExtensions,
  sanitizeTransitionForExtensions,
  stripDisabledExtensionData,
  type PetrinautExtensionSettings,
} from "./extensions";
import { migrateScenarioRowsForTypeEdit } from "./schema-migration";

import type {
  ArcEndpoint,
  Color,
  ComponentInstance,
  InputArc,
  OutputArc,
  SDCPN,
} from "./types/sdcpn";

export type MutationHelperFunctions = {
  [Name in keyof typeof mutationActionInputSchemas]: (
    input: MutationActionInput<Name>,
  ) => void;
};

export type CreatePetrinautActionsOptions = {
  /**
   * Whether action helpers should run the full document-level extension
   * sanitizer after each mutation. Defaults to true only when at least one
   * extension is disabled.
   */
  sanitizeAfterMutation?: boolean;
};

type TargetableInput = {
  targetSubnetId?: string | null;
};

type MutableNet = Pick<
  SDCPN,
  "places" | "transitions" | "types" | "differentialEquations" | "parameters"
> & {
  componentInstances?: ComponentInstance[];
};

type TransitionTemplateArc = {
  placeName: string;
  type: Color;
  weight: number;
};

const splitTargetSubnetId = <Input extends TargetableInput>(
  input: Input,
): [targetSubnetId: string | null, payload: Omit<Input, "targetSubnetId">] => {
  const { targetSubnetId = null, ...payload } = input;
  return [targetSubnetId, payload];
};

const getTypeById = (sdcpn: SDCPN, net: MutableNet): Map<string, Color> =>
  new Map(
    [
      ...sdcpn.types,
      ...(sdcpn.subnets ?? []).flatMap((subnet) => subnet.types),
      ...net.types,
    ].map((type) => [type.id, type]),
  );

const getTransitionTemplateArcs = ({
  transition,
  sdcpn,
  net,
  extensions,
}: {
  transition: SDCPN["transitions"][number];
  sdcpn: SDCPN;
  net: MutableNet;
  extensions: PetrinautExtensionSettings;
}): {
  inputs: TransitionTemplateArc[];
  outputs: TransitionTemplateArc[];
} => {
  const resolveArcPlace = createArcPlaceResolver(sdcpn, net, {
    componentPortsEnabled: extensions.subnets,
  });
  const typeById = getTypeById(sdcpn, net);

  const toTemplateArc = (
    arc: InputArc | OutputArc,
  ): TransitionTemplateArc | null => {
    const place = resolveArcPlace(arc);
    const type = place?.colorId ? typeById.get(place.colorId) : undefined;

    if (!place || !type) {
      return null;
    }

    return {
      placeName: place.name,
      type,
      weight: arc.weight,
    };
  };

  return {
    inputs: transition.inputArcs
      .filter((arc) => arc.type !== "inhibitor")
      .map(toTemplateArc)
      .filter((arc): arc is TransitionTemplateArc => arc !== null),
    outputs: transition.outputArcs
      .map(toTemplateArc)
      .filter((arc): arc is TransitionTemplateArc => arc !== null),
  };
};

const resolveTargetNet = (
  sdcpn: SDCPN,
  targetSubnetId: string | null | undefined,
): MutableNet => {
  if (!targetSubnetId) {
    return sdcpn;
  }

  const subnet = sdcpn.subnets?.find(({ id }) => id === targetSubnetId);
  if (!subnet) {
    throw new Error(`Subnet ID \`${targetSubnetId}\` does not exist.`);
  }

  return subnet;
};

const getComponentInstances = (net: MutableNet): ComponentInstance[] => {
  const componentInstances = net.componentInstances ?? [];
  const targetNet = net;
  targetNet.componentInstances = componentInstances;
  return componentInstances;
};

const getAllMutableNets = (sdcpn: SDCPN): MutableNet[] => [
  sdcpn,
  ...(sdcpn.subnets ?? []),
];

const normalizeArcEndpointInput = (input: {
  placeId?: string;
  endpoint?: ArcEndpoint;
}): ArcEndpoint => {
  if (input.endpoint) {
    return input.endpoint;
  }
  if (!input.placeId) {
    throw new Error("Arc endpoint input must include `placeId` or `endpoint`.");
  }
  return placeArcEndpoint(input.placeId);
};

const normalizeArcEndpointReplacementInput = (input: {
  oldPlaceId?: string;
  oldEndpoint?: ArcEndpoint;
  newPlaceId?: string;
  newEndpoint?: ArcEndpoint;
}): { oldEndpoint: ArcEndpoint; newEndpoint: ArcEndpoint } => ({
  oldEndpoint: normalizeArcEndpointInput({
    placeId: input.oldPlaceId,
    endpoint: input.oldEndpoint,
  }),
  newEndpoint: normalizeArcEndpointInput({
    placeId: input.newPlaceId,
    endpoint: input.newEndpoint,
  }),
});

const getTransitionArcsByDirection = (
  transition: SDCPN["transitions"][number],
  arcDirection: "input" | "output",
): InputArc[] | OutputArc[] =>
  arcDirection === "input" ? transition.inputArcs : transition.outputArcs;

const withArcEndpoint = <Arc extends InputArc | OutputArc>(
  arc: InputArc | OutputArc,
  endpoint: ArcEndpoint,
): Arc => {
  const { placeId: _placeId, endpoint: _endpoint, ...rest } = arc;
  return { ...rest, ...createArcEndpointReference(endpoint) } as Arc;
};

const removeArcsReferencingPlace = (net: MutableNet, placeId: string): void => {
  for (const transition of net.transitions) {
    for (let i = transition.inputArcs.length - 1; i >= 0; i--) {
      if (arcReferencesPlace(transition.inputArcs[i]!, placeId)) {
        transition.inputArcs.splice(i, 1);
      }
    }
    for (let i = transition.outputArcs.length - 1; i >= 0; i--) {
      if (arcReferencesPlace(transition.outputArcs[i]!, placeId)) {
        transition.outputArcs.splice(i, 1);
      }
    }
  }
};

const removeArcsReferencingComponentInstance = (
  net: MutableNet,
  componentInstanceId: string,
): void => {
  for (const transition of net.transitions) {
    for (let i = transition.inputArcs.length - 1; i >= 0; i--) {
      if (
        arcReferencesComponentInstance(
          transition.inputArcs[i]!,
          componentInstanceId,
        )
      ) {
        transition.inputArcs.splice(i, 1);
      }
    }
    for (let i = transition.outputArcs.length - 1; i >= 0; i--) {
      if (
        arcReferencesComponentInstance(
          transition.outputArcs[i]!,
          componentInstanceId,
        )
      ) {
        transition.outputArcs.splice(i, 1);
      }
    }
  }
};

const removeArcsReferencingSubnetPort = (
  sdcpn: SDCPN,
  subnetId: string,
  portPlaceId: string,
): void => {
  for (const net of getAllMutableNets(sdcpn)) {
    const matchingInstanceIds = new Set(
      (net.componentInstances ?? [])
        .filter((instance) => instance.subnetId === subnetId)
        .map((instance) => instance.id),
    );
    if (matchingInstanceIds.size === 0) {
      continue;
    }

    for (const transition of net.transitions) {
      for (let i = transition.inputArcs.length - 1; i >= 0; i--) {
        const endpoint = getArcEndpoint(transition.inputArcs[i]!);
        if (
          endpoint.kind === "componentPort" &&
          endpoint.portPlaceId === portPlaceId &&
          matchingInstanceIds.has(endpoint.componentInstanceId)
        ) {
          transition.inputArcs.splice(i, 1);
        }
      }
      for (let i = transition.outputArcs.length - 1; i >= 0; i--) {
        const endpoint = getArcEndpoint(transition.outputArcs[i]!);
        if (
          endpoint.kind === "componentPort" &&
          endpoint.portPlaceId === portPlaceId &&
          matchingInstanceIds.has(endpoint.componentInstanceId)
        ) {
          transition.outputArcs.splice(i, 1);
        }
      }
    }
  }
};

const removeComponentInstancesReferencingSubnet = (
  sdcpn: SDCPN,
  subnetId: string,
): void => {
  for (const net of getAllMutableNets(sdcpn)) {
    const instances = net.componentInstances;
    if (!instances) {
      continue;
    }
    for (let index = instances.length - 1; index >= 0; index--) {
      if (instances[index]!.subnetId === subnetId) {
        removeArcsReferencingComponentInstance(net, instances[index]!.id);
        instances.splice(index, 1);
      }
    }
  }
};

const assertArcEndpointReferences = (
  sdcpn: SDCPN,
  net: MutableNet,
  endpoint: ArcEndpoint,
): void => {
  if (endpoint.kind === "place") {
    if (!net.places.some((place) => place.id === endpoint.placeId)) {
      throw new Error(
        `Arc references place ID \`${endpoint.placeId}\` which does not exist in the target net.`,
      );
    }
    return;
  }

  const instance = (net.componentInstances ?? []).find(
    (candidate) => candidate.id === endpoint.componentInstanceId,
  );
  if (!instance) {
    throw new Error(
      `Arc references component instance ID \`${endpoint.componentInstanceId}\` which does not exist in the target net.`,
    );
  }

  const subnet = getComponentPortEndpointSubnet(sdcpn, instance);
  if (!subnet) {
    throw new Error(
      `Arc references component instance \`${instance.name}\`, but its subnet ID \`${instance.subnetId}\` does not exist.`,
    );
  }

  const port = subnet.places.find((place) => place.id === endpoint.portPlaceId);
  if (!port) {
    throw new Error(
      `Arc references subnet port place ID \`${endpoint.portPlaceId}\` which does not exist in subnet \`${subnet.name}\`.`,
    );
  }
  if (!port.isPort) {
    throw new Error(
      `Arc references subnet place \`${port.name}\`, but only places marked \`isPort\` can be used as component ports.`,
    );
  }
};

const assertComponentInstanceReferences = (
  sdcpn: SDCPN,
  instance: ComponentInstance,
): void => {
  const subnet = sdcpn.subnets?.find(({ id }) => id === instance.subnetId);
  if (!subnet) {
    throw new Error(
      `Component instance \`${instance.name}\` references subnet ID \`${instance.subnetId}\` which does not exist.`,
    );
  }

  const subnetParameterIds = new Set(subnet.parameters.map(({ id }) => id));

  for (const parameterId of Object.keys(instance.parameterValues)) {
    if (!subnetParameterIds.has(parameterId)) {
      throw new Error(
        `Component instance \`${instance.name}\` provides a value for unknown subnet parameter ID \`${parameterId}\`.`,
      );
    }
  }
};

/**
 * Validate that a single place's reference to a differential equation is
 * consistent: the equation must exist, the place must have a colour, and the
 * equation's `colorId` must match the place's `colorId`. Throws a descriptive
 * error when the invariant is violated; otherwise no-ops.
 *
 * Mirrors the runtime invariant enforced by the simulation engine, but raises
 * at mutation time so AI callers see the failure immediately instead of at
 * simulation build.
 */
function assertPlaceDynamicsReferences(
  place: SDCPN["places"][number],
  equations: SDCPN["differentialEquations"],
): void {
  if (place.differentialEquationId === null) {
    return;
  }
  const equation = equations.find(
    (eq) => eq.id === place.differentialEquationId,
  );
  if (!equation) {
    throw new Error(
      `Place \`${place.name}\` references differential equation ID \`${place.differentialEquationId}\` which does not exist.`,
    );
  }
  if (place.colorId === null) {
    throw new Error(
      `Place \`${place.name}\` has a differential equation but no \`colorId\`. Set the place's \`colorId\` to match the equation's \`colorId\` (\`${String(equation.colorId)}\`).`,
    );
  }
  if (equation.colorId !== null && equation.colorId !== place.colorId) {
    throw new Error(
      `Place \`${place.name}\` (colorId \`${place.colorId}\`) references differential equation \`${equation.name}\` (colorId \`${equation.colorId}\`); the equation's \`colorId\` must match the place's \`colorId\`.`,
    );
  }
}

export function createPetrinautActions(
  mutate: (fn: (sdcpn: SDCPN) => void) => void,
  extensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS,
  options: CreatePetrinautActionsOptions = {},
): MutationHelperFunctions {
  const canUseColors = extensions.colors;
  const canUseDynamics = extensions.colors && extensions.dynamics;
  const canUseParameters = extensions.parameters;
  const hasDisabledExtensions = Object.values(extensions).some(
    (enabled) => !enabled,
  );
  const shouldSanitizeAfterMutation =
    options.sanitizeAfterMutation ?? hasDisabledExtensions;

  const sanitizeTransition = (
    transition: SDCPN["transitions"][number],
    net: MutableNet,
    sdcpn: SDCPN,
    sanitizeOptions: { loadDefaultKernelWhenEmpty?: boolean } = {},
  ): void => {
    Object.assign(
      transition,
      sanitizeTransitionForExtensions(transition, sdcpn, extensions, net),
    );

    if (
      sanitizeOptions.loadDefaultKernelWhenEmpty &&
      transition.transitionKernelCode.trim() === "" &&
      getTransitionLogicAvailability(transition, sdcpn, extensions, net)
        .transitionKernel
    ) {
      const { inputs, outputs } = getTransitionTemplateArcs({
        transition,
        sdcpn,
        net,
        extensions,
      });
      Object.assign(transition, {
        transitionKernelCode: generateDefaultTransitionKernelCode(
          inputs,
          outputs,
        ),
      });
    }
  };

  const sanitizeAllTransitions = (sdcpn: SDCPN): void => {
    for (const net of getAllMutableNets(sdcpn)) {
      for (const transition of net.transitions) {
        sanitizeTransition(transition, net, sdcpn, {
          loadDefaultKernelWhenEmpty: true,
        });
      }
    }
  };

  const mutateWithExtensionGuards = (fn: (sdcpn: SDCPN) => void): void => {
    mutate((sdcpn) => {
      fn(sdcpn);
      if (shouldSanitizeAfterMutation) {
        stripDisabledExtensionData(sdcpn, extensions);
      }
    });
  };

  return {
    addPlace(input) {
      const parsed = mutationActionInputSchemas.addPlace.parse(input);
      const [targetSubnetId, place] = splitTargetSubnetId(parsed);
      const parsedPlace = sanitizePlaceForExtensions(
        placeSchema.parse(place),
        extensions,
      );
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, targetSubnetId);
        assertPlaceDynamicsReferences(parsedPlace, net.differentialEquations);
        net.places.push(parsedPlace);
      });
    },
    updatePlace(input) {
      const parsed = mutationActionInputSchemas.updatePlace.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        for (const place of net.places) {
          if (place.id === parsed.placeId) {
            Object.assign(place, parsed.update);
            Object.assign(place, sanitizePlaceForExtensions(place, extensions));
            placeSchema.parse(place);
            assertPlaceDynamicsReferences(place, net.differentialEquations);
            sanitizeAllTransitions(sdcpn);
            break;
          }
        }
      });
    },
    updatePlacePosition(input) {
      const parsed =
        mutationActionInputSchemas.updatePlacePosition.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        for (const place of net.places) {
          if (place.id === parsed.placeId) {
            place.x = parsed.position.x;
            place.y = parsed.position.y;
            break;
          }
        }
      });
    },
    removePlace(input) {
      const parsed = mutationActionInputSchemas.removePlace.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        for (const [placeIndex, place] of net.places.entries()) {
          if (place.id === parsed.placeId) {
            net.places.splice(placeIndex, 1);

            removeArcsReferencingPlace(net, parsed.placeId);

            if (parsed.targetSubnetId) {
              removeArcsReferencingSubnetPort(
                sdcpn,
                parsed.targetSubnetId,
                parsed.placeId,
              );
            }
            sanitizeAllTransitions(sdcpn);
            break;
          }
        }
      });
    },
    addTransition(input) {
      const parsed = mutationActionInputSchemas.addTransition.parse(input);
      const [targetSubnetId, transition] = splitTargetSubnetId(parsed);
      const parsedTransition = transitionSchema.parse(transition);
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, targetSubnetId);
        sanitizeTransition(parsedTransition, net, sdcpn, {
          loadDefaultKernelWhenEmpty: true,
        });
        net.transitions.push(parsedTransition);
      });
    },
    updateTransition(input) {
      const parsed = mutationActionInputSchemas.updateTransition.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        for (const transition of net.transitions) {
          if (transition.id === parsed.transitionId) {
            Object.assign(transition, parsed.update);
            sanitizeTransition(transition, net, sdcpn);
            transitionSchema.parse(transition);
            break;
          }
        }
      });
    },
    updateTransitionPosition(input) {
      const parsed =
        mutationActionInputSchemas.updateTransitionPosition.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        for (const transition of net.transitions) {
          if (transition.id === parsed.transitionId) {
            transition.x = parsed.position.x;
            transition.y = parsed.position.y;
            break;
          }
        }
      });
    },
    removeTransition(input) {
      const parsed = mutationActionInputSchemas.removeTransition.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        for (const [index, transition] of net.transitions.entries()) {
          if (transition.id === parsed.transitionId) {
            net.transitions.splice(index, 1);
            break;
          }
        }
      });
    },
    addArc(input) {
      const parsed = mutationActionInputSchemas.addArc.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        const endpoint = normalizeArcEndpointInput(parsed);
        assertArcEndpointReferences(sdcpn, net, endpoint);
        for (const transition of net.transitions) {
          if (transition.id === parsed.transitionId) {
            if (parsed.arcDirection === "input") {
              if (
                transition.inputArcs.some((arc) =>
                  arcMatchesEndpoint(arc, endpoint),
                )
              ) {
                break;
              }
              transition.inputArcs.push({
                type: parsed.type ?? "standard",
                ...createArcEndpointReference(endpoint),
                weight: parsed.weight,
              });
            } else {
              if (
                transition.outputArcs.some((arc) =>
                  arcMatchesEndpoint(arc, endpoint),
                )
              ) {
                break;
              }
              transition.outputArcs.push({
                ...createArcEndpointReference(endpoint),
                weight: parsed.weight,
              });
            }
            sanitizeTransition(transition, net, sdcpn, {
              loadDefaultKernelWhenEmpty: true,
            });
            break;
          }
        }
      });
    },
    removeArc(input) {
      const parsed = mutationActionInputSchemas.removeArc.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        const endpoint = normalizeArcEndpointInput(parsed);
        for (const transition of net.transitions) {
          if (transition.id === parsed.transitionId) {
            const arcs = getTransitionArcsByDirection(
              transition,
              parsed.arcDirection,
            );
            for (const [index, arc] of arcs.entries()) {
              if (arcMatchesEndpoint(arc, endpoint)) {
                arcs.splice(index, 1);
                break;
              }
            }
            sanitizeTransition(transition, net, sdcpn);
            break;
          }
        }
      });
    },
    updateArcWeight(input) {
      const parsed = mutationActionInputSchemas.updateArcWeight.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        const endpoint = normalizeArcEndpointInput(parsed);
        for (const transition of net.transitions) {
          if (transition.id === parsed.transitionId) {
            const arcs = getTransitionArcsByDirection(
              transition,
              parsed.arcDirection,
            );
            for (const arc of arcs) {
              if (arcMatchesEndpoint(arc, endpoint)) {
                arc.weight = parsed.weight;
                break;
              }
            }
            break;
          }
        }
      });
    },
    updateArcType(input) {
      const parsed = mutationActionInputSchemas.updateArcType.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        const endpoint = normalizeArcEndpointInput(parsed);
        for (const transition of net.transitions) {
          if (transition.id === parsed.transitionId) {
            for (const arc of transition.inputArcs) {
              if (arcMatchesEndpoint(arc, endpoint)) {
                arc.type = parsed.type;
                break;
              }
            }
            sanitizeTransition(transition, net, sdcpn, {
              loadDefaultKernelWhenEmpty: true,
            });
            break;
          }
        }
      });
    },
    updateArcPlace(input) {
      const parsed = mutationActionInputSchemas.updateArcPlace.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        const { oldEndpoint, newEndpoint } =
          normalizeArcEndpointReplacementInput(parsed);
        assertArcEndpointReferences(sdcpn, net, newEndpoint);
        for (const transition of net.transitions) {
          if (transition.id === parsed.transitionId) {
            const arcs = getTransitionArcsByDirection(
              transition,
              parsed.arcDirection,
            );
            for (const [arcIndex, arc] of arcs.entries()) {
              if (arcMatchesEndpoint(arc, oldEndpoint)) {
                arcs[arcIndex] = withArcEndpoint(arc, newEndpoint);
                break;
              }
            }
            sanitizeTransition(transition, net, sdcpn, {
              loadDefaultKernelWhenEmpty: true,
            });
            break;
          }
        }
      });
    },
    addType(input) {
      const parsed = mutationActionInputSchemas.addType.parse(input);
      const [targetSubnetId, type] = splitTargetSubnetId(parsed);
      const parsedType = colorSchema.parse(type);
      if (!canUseColors) {
        return;
      }
      mutateWithExtensionGuards((sdcpn) => {
        resolveTargetNet(sdcpn, targetSubnetId).types.push(parsedType);
      });
    },
    updateType(input) {
      const parsed = mutationActionInputSchemas.updateType.parse(input);
      if (!canUseColors) {
        return;
      }
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        for (const type of net.types) {
          if (type.id === parsed.typeId) {
            Object.assign(type, parsed.update);
            colorSchema.parse(type);
            break;
          }
        }
      });
    },
    addTypeElement(input) {
      const parsed = mutationActionInputSchemas.addTypeElement.parse(input);
      if (!canUseColors) {
        return;
      }
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        for (const type of net.types) {
          if (type.id === parsed.typeId) {
            type.elements.push(parsed.element);
            colorSchema.parse(type);
            migrateScenarioRowsForTypeEdit(sdcpn, parsed.typeId, {
              kind: "add",
              element: parsed.element,
            });
            break;
          }
        }
      });
    },
    updateTypeElement(input) {
      const parsed = mutationActionInputSchemas.updateTypeElement.parse(input);
      if (!canUseColors) {
        return;
      }
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        for (const type of net.types) {
          if (type.id === parsed.typeId) {
            for (const [index, element] of type.elements.entries()) {
              if (element.elementId === parsed.elementId) {
                const previousElementType = element.type;
                Object.assign(element, parsed.update);
                colorSchema.parse(type);
                if (
                  parsed.update.type !== undefined &&
                  parsed.update.type !== previousElementType
                ) {
                  migrateScenarioRowsForTypeEdit(sdcpn, parsed.typeId, {
                    kind: "changeType",
                    index,
                    element,
                  });
                }
                break;
              }
            }
            break;
          }
        }
      });
    },
    removeTypeElement(input) {
      const parsed = mutationActionInputSchemas.removeTypeElement.parse(input);
      if (!canUseColors) {
        return;
      }
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        for (const type of net.types) {
          if (type.id === parsed.typeId) {
            for (const [index, element] of type.elements.entries()) {
              if (element.elementId === parsed.elementId) {
                type.elements.splice(index, 1);
                colorSchema.parse(type);
                migrateScenarioRowsForTypeEdit(sdcpn, parsed.typeId, {
                  kind: "remove",
                  index,
                });
                break;
              }
            }
            break;
          }
        }
      });
    },
    moveTypeElement(input) {
      const parsed = mutationActionInputSchemas.moveTypeElement.parse(input);
      if (!canUseColors) {
        return;
      }
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        for (const type of net.types) {
          if (type.id === parsed.typeId) {
            const fromIndex = type.elements.findIndex(
              (element) => element.elementId === parsed.elementId,
            );
            if (fromIndex === -1) {
              break;
            }
            const [element] = type.elements.splice(fromIndex, 1);
            if (element) {
              type.elements.splice(parsed.toIndex, 0, element);
              colorSchema.parse(type);
              // Use the actual landing index (splice clamps out-of-range
              // destinations to the end of the array).
              const toIndex = type.elements.findIndex(
                (candidate) => candidate.elementId === parsed.elementId,
              );
              if (toIndex !== fromIndex) {
                migrateScenarioRowsForTypeEdit(sdcpn, parsed.typeId, {
                  kind: "move",
                  fromIndex,
                  toIndex,
                });
              }
            }
            break;
          }
        }
      });
    },
    removeType(input) {
      const parsed = mutationActionInputSchemas.removeType.parse(input);
      if (!canUseColors) {
        return;
      }
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        for (const [index, type] of net.types.entries()) {
          if (type.id === parsed.typeId) {
            net.types.splice(index, 1);
            break;
          }
        }
        for (const place of net.places) {
          if (place.colorId === parsed.typeId) {
            place.colorId = null;
          }
        }
        for (const equation of net.differentialEquations) {
          if (equation.colorId === parsed.typeId) {
            equation.colorId = null;
          }
        }
        sanitizeAllTransitions(sdcpn);
      });
    },
    addDifferentialEquation(input) {
      const parsed =
        mutationActionInputSchemas.addDifferentialEquation.parse(input);
      const [targetSubnetId, equation] = splitTargetSubnetId(parsed);
      const parsedEquation = differentialEquationSchema.parse(equation);
      if (!canUseDynamics) {
        return;
      }
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, targetSubnetId);
        net.differentialEquations.push(parsedEquation);
        for (const place of net.places) {
          if (place.differentialEquationId === parsedEquation.id) {
            assertPlaceDynamicsReferences(place, net.differentialEquations);
          }
        }
      });
    },
    updateDifferentialEquation(input) {
      const parsed =
        mutationActionInputSchemas.updateDifferentialEquation.parse(input);
      if (!canUseDynamics) {
        return;
      }
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        for (const equation of net.differentialEquations) {
          if (equation.id === parsed.equationId) {
            Object.assign(equation, parsed.update);
            differentialEquationSchema.parse(equation);
            for (const place of net.places) {
              if (place.differentialEquationId === equation.id) {
                assertPlaceDynamicsReferences(place, net.differentialEquations);
              }
            }
            break;
          }
        }
      });
    },
    removeDifferentialEquation(input) {
      const parsed =
        mutationActionInputSchemas.removeDifferentialEquation.parse(input);
      if (!canUseDynamics) {
        return;
      }
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        for (const [index, equation] of net.differentialEquations.entries()) {
          if (equation.id === parsed.equationId) {
            net.differentialEquations.splice(index, 1);
            break;
          }
        }
        for (const place of net.places) {
          if (place.differentialEquationId === parsed.equationId) {
            place.differentialEquationId = null;
          }
        }
      });
    },
    addParameter(input) {
      const parsed = mutationActionInputSchemas.addParameter.parse(input);
      const [targetSubnetId, parameter] = splitTargetSubnetId(parsed);
      const parsedParameter = parameterSchema.parse(parameter);
      if (!canUseParameters) {
        return;
      }
      mutateWithExtensionGuards((sdcpn) => {
        resolveTargetNet(sdcpn, targetSubnetId).parameters.push(
          parsedParameter,
        );
      });
    },
    updateParameter(input) {
      const parsed = mutationActionInputSchemas.updateParameter.parse(input);
      if (!canUseParameters) {
        return;
      }
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        for (const parameter of net.parameters) {
          if (parameter.id === parsed.parameterId) {
            Object.assign(parameter, parsed.update);
            parameterSchema.parse(parameter);
            break;
          }
        }
      });
    },
    removeParameter(input) {
      const parsed = mutationActionInputSchemas.removeParameter.parse(input);
      if (!canUseParameters) {
        return;
      }
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        for (const [index, parameter] of net.parameters.entries()) {
          if (parameter.id === parsed.parameterId) {
            net.parameters.splice(index, 1);
            break;
          }
        }
      });
    },
    addScenario(scenario) {
      const parsedScenario = scenarioSchema.parse(scenario);
      mutateWithExtensionGuards((sdcpn) => {
        const targetSdcpn = sdcpn;
        targetSdcpn.scenarios ??= [];
        const scenarios = targetSdcpn.scenarios;
        scenarios.push(parsedScenario);
      });
    },
    updateScenario(input) {
      const parsed = mutationActionInputSchemas.updateScenario.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        for (const scenario of sdcpn.scenarios ?? []) {
          if (scenario.id === parsed.scenarioId) {
            Object.assign(scenario, parsed.update);
            scenarioSchema.parse(scenario);
            break;
          }
        }
      });
    },
    removeScenario(input) {
      const { scenarioId: parsedScenarioId } =
        mutationActionInputSchemas.removeScenario.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        const scenarios = sdcpn.scenarios;
        if (!scenarios) {
          return;
        }
        for (const [index, scenario] of scenarios.entries()) {
          if (scenario.id === parsedScenarioId) {
            scenarios.splice(index, 1);
            break;
          }
        }
      });
    },
    addMetric(metric) {
      const parsedMetric = metricSchema.parse(metric);
      mutateWithExtensionGuards((sdcpn) => {
        const targetSdcpn = sdcpn;
        targetSdcpn.metrics ??= [];
        const metrics = targetSdcpn.metrics;
        metrics.push(parsedMetric);
      });
    },
    updateMetric(input) {
      const parsed = mutationActionInputSchemas.updateMetric.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        for (const metric of sdcpn.metrics ?? []) {
          if (metric.id === parsed.metricId) {
            Object.assign(metric, parsed.update);
            metricSchema.parse(metric);
            break;
          }
        }
      });
    },
    removeMetric(input) {
      const { metricId: parsedMetricId } =
        mutationActionInputSchemas.removeMetric.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        const metrics = sdcpn.metrics;
        if (!metrics) {
          return;
        }
        for (const [index, metric] of metrics.entries()) {
          if (metric.id === parsedMetricId) {
            metrics.splice(index, 1);
            break;
          }
        }
      });
    },
    addSubnet(subnet) {
      const parsedSubnet = subnetSchema.parse(subnet);
      mutateWithExtensionGuards((sdcpn) => {
        const targetSdcpn = sdcpn;
        targetSdcpn.subnets ??= [];
        const subnets = targetSdcpn.subnets;
        subnets.push(parsedSubnet);
      });
    },
    updateSubnet(input) {
      const parsed = mutationActionInputSchemas.updateSubnet.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        for (const subnet of sdcpn.subnets ?? []) {
          if (subnet.id === parsed.subnetId) {
            Object.assign(subnet, parsed.update);
            subnetSchema.parse(subnet);
            break;
          }
        }
      });
    },
    removeSubnet(input) {
      const { subnetId } = mutationActionInputSchemas.removeSubnet.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        const subnets = sdcpn.subnets;
        if (!subnets) {
          return;
        }
        for (const [index, subnet] of subnets.entries()) {
          if (subnet.id === subnetId) {
            subnets.splice(index, 1);
            removeComponentInstancesReferencingSubnet(sdcpn, subnetId);
            break;
          }
        }
      });
    },
    addComponentInstance(input) {
      const parsed =
        mutationActionInputSchemas.addComponentInstance.parse(input);
      const [targetSubnetId, instance] = splitTargetSubnetId(parsed);
      const parsedInstance = componentInstanceSchema.parse(instance);
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, targetSubnetId);
        assertComponentInstanceReferences(sdcpn, parsedInstance);
        getComponentInstances(net).push(parsedInstance);
      });
    },
    updateComponentInstance(input) {
      const parsed =
        mutationActionInputSchemas.updateComponentInstance.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        for (const instance of net.componentInstances ?? []) {
          if (instance.id === parsed.instanceId) {
            Object.assign(instance, parsed.update);
            componentInstanceSchema.parse(instance);
            assertComponentInstanceReferences(sdcpn, instance);
            break;
          }
        }
      });
    },
    updateComponentInstancePosition(input) {
      const parsed =
        mutationActionInputSchemas.updateComponentInstancePosition.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        for (const instance of net.componentInstances ?? []) {
          if (instance.id === parsed.instanceId) {
            instance.x = parsed.position.x;
            instance.y = parsed.position.y;
            break;
          }
        }
      });
    },
    removeComponentInstance(input) {
      const parsed =
        mutationActionInputSchemas.removeComponentInstance.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        const instances = net.componentInstances;
        if (!instances) {
          return;
        }
        for (const [index, instance] of instances.entries()) {
          if (instance.id === parsed.instanceId) {
            removeArcsReferencingComponentInstance(net, instance.id);
            instances.splice(index, 1);
            break;
          }
        }
      });
    },
    deleteItemsByIds(input) {
      const parsed = mutationActionInputSchemas.deleteItemsByIds.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        const placeIds = new Set<string>();
        const transitionIds = new Set<string>();
        const arcIds = new Set<string>();
        const componentInstanceIds = new Set<string>();
        const typeIds = new Set<string>();
        const equationIds = new Set<string>();
        const parameterIds = new Set<string>();

        for (const item of parsed.items) {
          const { id } = item;
          switch (item.type) {
            case "place":
              placeIds.add(id);
              break;
            case "transition":
              transitionIds.add(id);
              break;
            case "arc":
              arcIds.add(id);
              break;
            case "componentInstance":
              componentInstanceIds.add(id);
              break;
            case "type":
              typeIds.add(id);
              break;
            case "differentialEquation":
              equationIds.add(id);
              break;
            case "parameter":
              parameterIds.add(id);
              break;
          }
        }

        const hasCanvasDeletes =
          placeIds.size > 0 ||
          transitionIds.size > 0 ||
          arcIds.size > 0 ||
          componentInstanceIds.size > 0;

        if (hasCanvasDeletes) {
          for (let i = net.transitions.length - 1; i >= 0; i--) {
            const transition = net.transitions[i]!;
            if (transitionIds.has(transition.id)) {
              net.transitions.splice(i, 1);
              continue;
            }

            for (
              let inputArcIndex = transition.inputArcs.length - 1;
              inputArcIndex >= 0;
              inputArcIndex--
            ) {
              const inputArc = transition.inputArcs[inputArcIndex]!;
              const endpoint = getArcEndpoint(inputArc);
              const arcId = generateArcId({
                inputId: getArcEndpointKey(endpoint),
                outputId: transition.id,
              });

              if (
                arcIds.has(arcId) ||
                (endpoint.kind === "place" && placeIds.has(endpoint.placeId)) ||
                (endpoint.kind === "componentPort" &&
                  componentInstanceIds.has(endpoint.componentInstanceId))
              ) {
                transition.inputArcs.splice(inputArcIndex, 1);
              }
            }

            for (
              let outputArcIndex = transition.outputArcs.length - 1;
              outputArcIndex >= 0;
              outputArcIndex--
            ) {
              const outputArc = transition.outputArcs[outputArcIndex]!;
              const endpoint = getArcEndpoint(outputArc);
              const arcId = generateArcId({
                inputId: transition.id,
                outputId: getArcEndpointKey(endpoint),
              });

              if (
                arcIds.has(arcId) ||
                (endpoint.kind === "place" && placeIds.has(endpoint.placeId)) ||
                (endpoint.kind === "componentPort" &&
                  componentInstanceIds.has(endpoint.componentInstanceId))
              ) {
                transition.outputArcs.splice(outputArcIndex, 1);
              }
            }
          }

          for (let i = net.places.length - 1; i >= 0; i--) {
            const place = net.places[i]!;
            if (placeIds.has(place.id)) {
              net.places.splice(i, 1);
              if (parsed.targetSubnetId) {
                removeArcsReferencingSubnetPort(
                  sdcpn,
                  parsed.targetSubnetId,
                  place.id,
                );
              }
            }
          }
        }

        if (componentInstanceIds.size > 0) {
          const instances = net.componentInstances;
          if (instances) {
            for (let i = instances.length - 1; i >= 0; i--) {
              if (componentInstanceIds.has(instances[i]!.id)) {
                removeArcsReferencingComponentInstance(net, instances[i]!.id);
                instances.splice(i, 1);
              }
            }
          }
        }

        if (typeIds.size > 0) {
          for (let i = net.types.length - 1; i >= 0; i--) {
            if (typeIds.has(net.types[i]!.id)) {
              net.types.splice(i, 1);
            }
          }
          for (const place of net.places) {
            if (place.colorId && typeIds.has(place.colorId)) {
              place.colorId = null;
            }
          }
          for (const equation of net.differentialEquations) {
            if (equation.colorId && typeIds.has(equation.colorId)) {
              equation.colorId = null;
            }
          }
        }

        if (equationIds.size > 0) {
          for (let i = net.differentialEquations.length - 1; i >= 0; i--) {
            if (equationIds.has(net.differentialEquations[i]!.id)) {
              net.differentialEquations.splice(i, 1);
            }
          }
          for (const place of net.places) {
            if (
              place.differentialEquationId &&
              equationIds.has(place.differentialEquationId)
            ) {
              place.differentialEquationId = null;
            }
          }
        }

        if (parameterIds.size > 0) {
          for (let i = net.parameters.length - 1; i >= 0; i--) {
            if (parameterIds.has(net.parameters[i]!.id)) {
              net.parameters.splice(i, 1);
            }
          }
        }

        if (hasCanvasDeletes || typeIds.size > 0) {
          sanitizeAllTransitions(sdcpn);
        }
      });
    },
    commitNodePositions(input) {
      const parsed =
        mutationActionInputSchemas.commitNodePositions.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        for (const { id, itemType, position } of parsed.commits) {
          if (itemType === "place") {
            for (const place of net.places) {
              if (place.id === id) {
                place.x = position.x;
                place.y = position.y;
                break;
              }
            }
          } else if (itemType === "transition") {
            for (const transition of net.transitions) {
              if (transition.id === id) {
                transition.x = position.x;
                transition.y = position.y;
                break;
              }
            }
          } else {
            for (const instance of net.componentInstances ?? []) {
              if (instance.id === id) {
                instance.x = position.x;
                instance.y = position.y;
                break;
              }
            }
          }
        }
      });
    },
  };
}
