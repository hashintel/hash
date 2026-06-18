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

const scopedId = (path: readonly ID[], id: ID): ID =>
  path.length === 0 ? id : [...path, id].join(scopeSeparator);

const codeIdentifier = (value: string): string => {
  const cleaned = value.replace(/[^A-Za-z0-9_$]/g, "_");
  if (/^[A-Za-z_$]/.test(cleaned)) {
    return cleaned;
  }
  return `_${cleaned}`;
};

const endpointPlaceName = ({
  instance,
  portName,
}: {
  instance: ComponentInstance;
  portName: string;
}): string => codeIdentifier(`${instance.name}_${portName}`);

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

type FlattenContext = {
  source: SDCPN;
  target: MutableFlatSDCPN;
  parametersEnabled: boolean;
  transitionParameterValues: Map<ID, ParameterValues>;
  placeParameterValues: Map<ID, ParameterValues>;
  arcPlaceNameOverrides: Map<string, string>;
};

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
    return null;
  }

  const subnet = ctx.source.subnets?.find(({ id }) => id === instance.subnetId);
  const port = subnet?.places.find(
    (place) => place.id === endpoint.portPlaceId && place.isPort,
  );
  if (!subnet || !port) {
    return null;
  }

  const placeId = scopedId([...path, instance.id], endpoint.portPlaceId);
  ctx.arcPlaceNameOverrides.set(
    getArcPlaceNameOverrideKey({
      transitionId: mappedTransitionId,
      placeId,
    }),
    endpointPlaceName({ instance, portName: port.name }),
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
  parameterValues,
}: {
  ctx: FlattenContext;
  net: SDCPN | Subnet;
  path: readonly ID[];
  parameterValues: ParameterValues;
}): void => {
  const typeIdMap = new Map<ID, ID>();
  const equationIdMap = new Map<ID, ID>();
  const placeIdMap = new Map<ID, ID>();

  for (const type of net.types) {
    const id = scopedId(path, type.id);
    typeIdMap.set(type.id, id);
    ctx.target.types.push({
      ...type,
      id,
      elements: type.elements.map((element) => ({ ...element })),
    });
  }

  for (const equation of net.differentialEquations) {
    const id = scopedId(path, equation.id);
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
    ctx.target.parameters.push({ ...parameter, id });
  }

  for (const place of net.places) {
    const id = scopedId(path, place.id);
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
      continue;
    }
    flattenNet({
      ctx,
      net: subnet,
      path: [...path, instance.id],
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
  if ((sdcpn.componentInstances ?? []).length === 0) {
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
    transitionParameterValues: new Map(),
    placeParameterValues: new Map(),
    arcPlaceNameOverrides: new Map(),
  };

  flattenNet({
    ctx,
    net: sdcpn,
    path: [],
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
