import { getArcEndpoint } from "../../arc-endpoints";

import type {
  ArcEndpoint,
  ComponentInstance,
  ID,
  InputArc,
  OutputArc,
  Parameter,
  SDCPN,
  Subnet,
  Transition,
} from "../../types/sdcpn";
import type { InitialMarking } from "../api";
import type { ParameterValues } from "./types";

export type FlattenedSimulationDefinition = {
  sdcpn: SDCPN;
  initialMarking: InitialMarking;
  transitionParameterValues: Map<ID, ParameterValues>;
  placeParameterValues: Map<ID, ParameterValues>;
  arcPlaceNameOverrides: Map<string, string>;
};

export const getArcPlaceNameOverrideKey = ({
  transitionId,
  placeId,
}: {
  transitionId: ID;
  placeId: ID;
}): string => `${transitionId}\u0000${placeId}`;

const scopeSeparator = "::";

const assertScopableId = (id: ID): void => {
  if (id.includes(scopeSeparator)) {
    throw new Error(
      `SDCPN IDs used with component instances must not contain the scope separator \`${scopeSeparator}\`: \`${id}\`.`,
    );
  }
};

const scopedId = (path: readonly ID[], id: ID): ID => {
  for (const part of path) {
    assertScopableId(part);
  }
  assertScopableId(id);

  return path.length === 0 ? id : [...path, id].join(scopeSeparator);
};

const _codeIdentifier = (value: string): string => {
  const cleaned = value.replace(/[^A-Za-z0-9_$]/g, "_");
  if (/^[A-Za-z_$]/.test(cleaned)) {
    return cleaned;
  }
  return `_${cleaned}`;
};

const scopedPortPlaceName = ({
  instance,
  portName,
}: {
  instance: ComponentInstance;
  portName: string;
}): string => `${instance.name}${scopeSeparator}${portName}`;

const coerceParameterValue = (
  parameter: Parameter,
  rawValue: string | undefined,
): number | boolean => {
  const value = rawValue ?? parameter.defaultValue;
  if (parameter.type === "boolean") {
    return value === "true";
  }
  return Number(value) || 0;
};

const deriveInstanceParameterValues = (
  parameters: readonly Parameter[],
  parameterValuesById: Record<ID, string>,
): ParameterValues => {
  const values: ParameterValues = {};
  for (const parameter of parameters) {
    values[parameter.variableName] = coerceParameterValue(
      parameter,
      parameterValuesById[parameter.id],
    );
  }
  return values;
};

type MutableFlatSDCPN = SDCPN & {
  subnets: Subnet[];
  componentInstances: ComponentInstance[];
};

type FlatIdSets = {
  places: Set<ID>;
  transitions: Set<ID>;
  types: Set<ID>;
  differentialEquations: Set<ID>;
  parameters: Set<ID>;
};

type FlattenContext = {
  source: SDCPN;
  target: MutableFlatSDCPN;
  parametersEnabled: boolean;
  flatIds: FlatIdSets;
  transitionParameterValues: Map<ID, ParameterValues>;
  placeParameterValues: Map<ID, ParameterValues>;
  arcPlaceNameOverrides: Map<string, string>;
};

const assertUniqueFlatId = ({
  ctx,
  kind,
  id,
}: {
  ctx: FlattenContext;
  kind: keyof FlatIdSets;
  id: ID;
}): void => {
  const ids = ctx.flatIds[kind];
  if (ids.has(id)) {
    throw new Error(
      `Flattening component instances produced duplicate ${kind} ID \`${id}\`.`,
    );
  }
  ids.add(id);
};

const netHasComponentPortArcs = (net: SDCPN | Subnet): boolean =>
  net.transitions.some((transition) =>
    [...transition.inputArcs, ...transition.outputArcs].some(
      (arc) => getArcEndpoint(arc).kind === "componentPort",
    ),
  );

const resolveComponentPortEndpoint = ({
  ctx,
  net,
  path,
  endpoint,
  mappedTransitionId,
}: {
  ctx: FlattenContext;
  net: SDCPN | Subnet;
  path: readonly ID[];
  endpoint: Extract<ArcEndpoint, { kind: "componentPort" }>;
  mappedTransitionId: ID;
}): ID | null => {
  const instance = (net.componentInstances ?? []).find(
    (candidate) => candidate.id === endpoint.componentInstanceId,
  );
  if (!instance) {
    throw new Error(
      `Arc references component instance ID \`${endpoint.componentInstanceId}\` which does not exist in the containing net.`,
    );
  }

  const subnet = ctx.source.subnets?.find(({ id }) => id === instance.subnetId);
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

  const placeId = scopedId([...path, instance.id], endpoint.portPlaceId);
  ctx.arcPlaceNameOverrides.set(
    getArcPlaceNameOverrideKey({
      transitionId: mappedTransitionId,
      placeId,
    }),
    scopedPortPlaceName({ instance, portName: port.name }),
  );
  return placeId;
};

const mapArcToFlatPlace = ({
  ctx,
  net,
  path,
  placeIdMap,
  transitionId,
  arc,
}: {
  ctx: FlattenContext;
  net: SDCPN | Subnet;
  path: readonly ID[];
  placeIdMap: ReadonlyMap<ID, ID>;
  transitionId: ID;
  arc: InputArc | OutputArc;
}): ID | null => {
  const endpoint = getArcEndpoint(arc);
  if (endpoint.kind === "place") {
    return placeIdMap.get(endpoint.placeId) ?? null;
  }
  return resolveComponentPortEndpoint({
    ctx,
    net,
    path,
    endpoint,
    mappedTransitionId: transitionId,
  });
};

const cloneInputArc = ({
  ctx,
  net,
  path,
  placeIdMap,
  transitionId,
  arc,
}: {
  ctx: FlattenContext;
  net: SDCPN | Subnet;
  path: readonly ID[];
  placeIdMap: ReadonlyMap<ID, ID>;
  transitionId: ID;
  arc: InputArc;
}): InputArc | null => {
  const placeId = mapArcToFlatPlace({
    ctx,
    net,
    path,
    placeIdMap,
    transitionId,
    arc,
  });
  return placeId ? { placeId, weight: arc.weight, type: arc.type } : null;
};

const cloneOutputArc = ({
  ctx,
  net,
  path,
  placeIdMap,
  transitionId,
  arc,
}: {
  ctx: FlattenContext;
  net: SDCPN | Subnet;
  path: readonly ID[];
  placeIdMap: ReadonlyMap<ID, ID>;
  transitionId: ID;
  arc: OutputArc;
}): OutputArc | null => {
  const placeId = mapArcToFlatPlace({
    ctx,
    net,
    path,
    placeIdMap,
    transitionId,
    arc,
  });
  return placeId ? { placeId, weight: arc.weight } : null;
};

const flattenNet = ({
  ctx,
  net,
  path,
  activeSubnetIds,
  parameterValues,
}: {
  ctx: FlattenContext;
  net: SDCPN | Subnet;
  path: readonly ID[];
  activeSubnetIds: readonly ID[];
  parameterValues: ParameterValues;
}): void => {
  const typeIdMap = new Map<ID, ID>();
  const equationIdMap = new Map<ID, ID>();
  const placeIdMap = new Map<ID, ID>();

  for (const type of net.types) {
    const id = scopedId(path, type.id);
    assertUniqueFlatId({ ctx, kind: "types", id });
    typeIdMap.set(type.id, id);
    ctx.target.types.push({
      ...type,
      id,
      elements: type.elements.map((element) => ({ ...element })),
    });
  }

  for (const equation of net.differentialEquations) {
    const id = scopedId(path, equation.id);
    assertUniqueFlatId({ ctx, kind: "differentialEquations", id });
    equationIdMap.set(equation.id, id);
    ctx.target.differentialEquations.push({
      ...equation,
      id,
      colorId: equation.colorId
        ? (typeIdMap.get(equation.colorId) ?? equation.colorId)
        : null,
    });
  }

  for (const parameter of net.parameters) {
    const id = scopedId(path, parameter.id);
    assertUniqueFlatId({ ctx, kind: "parameters", id });
    ctx.target.parameters.push({ ...parameter, id });
  }

  for (const place of net.places) {
    const id = scopedId(path, place.id);
    assertUniqueFlatId({ ctx, kind: "places", id });
    placeIdMap.set(place.id, id);
    ctx.placeParameterValues.set(id, parameterValues);
    ctx.target.places.push({
      ...place,
      id,
      colorId: place.colorId ? (typeIdMap.get(place.colorId) ?? null) : null,
      differentialEquationId: place.differentialEquationId
        ? (equationIdMap.get(place.differentialEquationId) ?? null)
        : null,
    });
  }

  for (const transition of net.transitions) {
    const id = scopedId(path, transition.id);
    assertUniqueFlatId({ ctx, kind: "transitions", id });
    ctx.transitionParameterValues.set(id, parameterValues);

    const cloneBase: Omit<Transition, "inputArcs" | "outputArcs"> = {
      ...transition,
      id,
    };

    ctx.target.transitions.push({
      ...cloneBase,
      inputArcs: transition.inputArcs
        .map((arc) =>
          cloneInputArc({
            ctx,
            net,
            path,
            placeIdMap,
            transitionId: id,
            arc,
          }),
        )
        .filter((arc): arc is InputArc => arc !== null),
      outputArcs: transition.outputArcs
        .map((arc) =>
          cloneOutputArc({
            ctx,
            net,
            path,
            placeIdMap,
            transitionId: id,
            arc,
          }),
        )
        .filter((arc): arc is OutputArc => arc !== null),
    });
  }

  for (const instance of net.componentInstances ?? []) {
    const subnet = ctx.source.subnets?.find(
      ({ id }) => id === instance.subnetId,
    );
    if (!subnet) {
      throw new Error(
        `Component instance \`${instance.name}\` references subnet ID \`${instance.subnetId}\` which does not exist.`,
      );
    }
    if (activeSubnetIds.includes(instance.subnetId)) {
      throw new Error(
        `Component subnet cycle detected: ${[
          ...activeSubnetIds,
          instance.subnetId,
        ].join(" -> ")}.`,
      );
    }
    flattenNet({
      ctx,
      net: subnet,
      path: [...path, instance.id],
      activeSubnetIds: [...activeSubnetIds, instance.subnetId],
      parameterValues: ctx.parametersEnabled
        ? deriveInstanceParameterValues(
            subnet.parameters,
            instance.parameterValues,
          )
        : {},
    });
  }
};

export const flattenComponentInstancesForSimulation = ({
  sdcpn,
  initialMarking,
  rootParameterValues,
  parametersEnabled,
}: {
  sdcpn: SDCPN;
  initialMarking: InitialMarking;
  rootParameterValues: ParameterValues;
  parametersEnabled: boolean;
}): FlattenedSimulationDefinition => {
  const hasRootComponentPortArcs = netHasComponentPortArcs(sdcpn);

  if (
    (sdcpn.componentInstances ?? []).length === 0 &&
    !hasRootComponentPortArcs
  ) {
    let hasNestedInstances = false;
    for (const subnet of sdcpn.subnets ?? []) {
      if ((subnet.componentInstances ?? []).length > 0) {
        hasNestedInstances = true;
        break;
      }
    }
    if (!hasNestedInstances) {
      const transitionParameterValues = new Map<ID, ParameterValues>();
      const placeParameterValues = new Map<ID, ParameterValues>();
      for (const transition of sdcpn.transitions) {
        transitionParameterValues.set(transition.id, rootParameterValues);
      }
      for (const place of sdcpn.places) {
        placeParameterValues.set(place.id, rootParameterValues);
      }
      return {
        sdcpn,
        initialMarking,
        transitionParameterValues,
        placeParameterValues,
        arcPlaceNameOverrides: new Map(),
      };
    }
  }

  const target: MutableFlatSDCPN = {
    places: [],
    transitions: [],
    types: [],
    differentialEquations: [],
    parameters: [],
    scenarios: sdcpn.scenarios?.map((scenario) => ({ ...scenario })),
    metrics: sdcpn.metrics?.map((metric) => ({ ...metric })),
    subnets: [],
    componentInstances: [],
  };

  const ctx: FlattenContext = {
    source: sdcpn,
    target,
    parametersEnabled,
    flatIds: {
      places: new Set(),
      transitions: new Set(),
      types: new Set(),
      differentialEquations: new Set(),
      parameters: new Set(),
    },
    transitionParameterValues: new Map(),
    placeParameterValues: new Map(),
    arcPlaceNameOverrides: new Map(),
  };

  flattenNet({
    ctx,
    net: sdcpn,
    path: [],
    activeSubnetIds: [],
    parameterValues: rootParameterValues,
  });

  const rootPlaceIds = new Set(sdcpn.places.map((place) => place.id));
  const flatPlaceIds = new Set(target.places.map((place) => place.id));
  const flatInitialMarking: InitialMarking = {};
  for (const [placeId, value] of Object.entries(initialMarking)) {
    if (flatPlaceIds.has(placeId) || !rootPlaceIds.has(placeId)) {
      flatInitialMarking[placeId] = value;
    }
  }

  return {
    sdcpn: target,
    initialMarking: flatInitialMarking,
    transitionParameterValues: ctx.transitionParameterValues,
    placeParameterValues: ctx.placeParameterValues,
    arcPlaceNameOverrides: ctx.arcPlaceNameOverrides,
  };
};
