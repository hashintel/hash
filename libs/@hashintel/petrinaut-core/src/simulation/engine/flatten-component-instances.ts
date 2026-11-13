import { getArcEndpoint } from "../../arc-endpoints";
import {
  applyFusions,
  type FusionGroup,
} from "../../composition/apply-fusions";
import { fusionAnchor, fusionMemberIssues } from "../../composition/fusions";
import { remapPlaceDynamics } from "../../place-dynamics";
import { createUserKeyedRecord, getOwn } from "../../validation/record-keys";
import { scopedId, scopeSeparator } from "./scoped-id";

import type {
  ArcEndpoint,
  ComponentInstance,
  ID,
  InputArc,
  OutputArc,
  Parameter,
  Place,
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
  // Keyed by parameter variable names from the net definition: no prototype.
  const values: ParameterValues = createUserKeyedRecord();
  for (const parameter of parameters) {
    values[parameter.variableName] = coerceParameterValue(
      parameter,
      getOwn(parameterValuesById, parameter.id),
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
  /** Every fusion of every net, as flat place ids, applied once flattening is done. */
  fusionGroups: FusionGroup[];
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

/**
 * The flat place behind a port of one of `net`'s instances, for the arc or
 * the fusion `referrer` names. Throws when the instance, its subnet or the
 * port does not exist.
 */
const flatPortPlace = ({
  ctx,
  net,
  path,
  endpoint,
  referrer,
}: {
  ctx: FlattenContext;
  net: SDCPN | Subnet;
  path: readonly ID[];
  endpoint: Extract<ArcEndpoint, { kind: "componentPort" }>;
  referrer: string;
}): { instance: ComponentInstance; port: Place; placeId: ID } => {
  const instance = (net.componentInstances ?? []).find(
    (candidate) => candidate.id === endpoint.componentInstanceId,
  );
  if (!instance) {
    throw new Error(
      `${referrer} references component instance ID \`${endpoint.componentInstanceId}\` which does not exist in the containing net.`,
    );
  }

  const subnet = ctx.source.subnets?.find(({ id }) => id === instance.subnetId);
  if (!subnet) {
    throw new Error(
      `${referrer} references component instance \`${instance.name}\`, but its subnet ID \`${instance.subnetId}\` does not exist.`,
    );
  }

  const port = subnet.places.find((place) => place.id === endpoint.portPlaceId);
  if (!port) {
    throw new Error(
      `${referrer} references subnet port place ID \`${endpoint.portPlaceId}\` which does not exist in subnet \`${subnet.name}\`.`,
    );
  }
  if (!port.isPort) {
    throw new Error(
      `${referrer} references subnet place \`${port.name}\`, but only places marked \`isPort\` can be used as component ports.`,
    );
  }

  return {
    instance,
    port,
    placeId: scopedId([...path, instance.id], endpoint.portPlaceId),
  };
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
  const { instance, port, placeId } = flatPortPlace({
    ctx,
    net,
    path,
    endpoint,
    referrer: "Arc",
  });
  ctx.arcPlaceNameOverrides.set(
    getArcPlaceNameOverrideKey({ transitionId, placeId }),
    scopedPortPlaceName({ instance, portName: port.name }),
  );
  return placeId;
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
      ...remapPlaceDynamics(
        place,
        (equationId) => equationIdMap.get(equationId) ?? equationId,
      ),
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

  for (const fusion of net.fusions ?? []) {
    const label = `\`${fusion.name ?? fusion.id}\``;
    if (fusionMemberIssues(fusion.members).multipleAnchors) {
      throw new Error(
        `Fusion ${label} holds more than one place of its net: they would become one place.`,
      );
    }
    const placeIds = fusion.members.map((member) => {
      if (member.kind === "componentPort") {
        return flatPortPlace({
          ctx,
          net,
          path,
          endpoint: member,
          referrer: `Fusion ${label}`,
        }).placeId;
      }
      const placeId = placeIdMap.get(member.placeId);
      if (placeId === undefined) {
        throw new Error(
          `Fusion ${label} references place ID \`${member.placeId}\` which does not exist in its net.`,
        );
      }
      return placeId;
    });
    ctx.fusionGroups.push({
      label,
      placeIds,
      // An anchor keeps its own name; without one the fusion names the place.
      ...(fusionAnchor(fusion) || fusion.name === undefined
        ? {}
        : { name: fusion.name }),
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
    fusionGroups: [],
  };

  flattenNet({
    ctx,
    net: sdcpn,
    path: [],
    activeSubnetIds: [],
    parameterValues: rootParameterValues,
  });

  const { aliases: fusedPlaceAliases, dynamicsDonors } = applyFusions(
    target,
    ctx.fusionGroups,
  );
  // Equations a fused place took from a merged place read that place's
  // parameter values, not the fused place's own.
  for (const [fusedId, donorId] of dynamicsDonors) {
    const donorValues = ctx.placeParameterValues.get(donorId);
    if (donorValues) {
      ctx.placeParameterValues.set(fusedId, donorValues);
    }
  }
  for (const mergedId of fusedPlaceAliases.keys()) {
    ctx.placeParameterValues.delete(mergedId);
  }

  const rootPlaceIds = new Set(sdcpn.places.map((place) => place.id));
  const flatPlaceIds = new Set(target.places.map((place) => place.id));
  // Keyed by place ids from stored run inputs: no prototype.
  const flatInitialMarking: InitialMarking = createUserKeyedRecord();
  for (const [placeId, value] of Object.entries(initialMarking)) {
    const flatPlaceId = fusedPlaceAliases.get(placeId) ?? placeId;
    if (
      (flatPlaceIds.has(flatPlaceId) || !rootPlaceIds.has(flatPlaceId)) &&
      !(flatPlaceId in flatInitialMarking)
    ) {
      flatInitialMarking[flatPlaceId] = value;
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
