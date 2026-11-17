import { getArcEndpoint, getArcEndpointKey } from "../../arc-endpoints";
import {
  applyFusions,
  type FusionGroup,
} from "../../composition/apply-fusions";
import {
  checkImplementation,
  indexImplementation,
} from "../../composition/check-interfaces";
import { equationKey, fusionMemberIssues } from "../../composition/fusions";
import {
  bindingKey,
  describeMissingComponent,
  describeUnboundInstance,
  indexDocument,
  resolveImplementation,
  runningComponent,
  type DocumentIndex,
  type RunningComponent,
} from "../../composition/interfaces";
import { remapPlaceDynamics } from "../../place-dynamics";
import { createUserKeyedRecord, getOwn } from "../../validation/record-keys";
import { scopedId, scopeSeparator } from "./scoped-id";

import type {
  ArcEndpoint,
  Component,
  ComponentInstance,
  ID,
  InputArc,
  OutputArc,
  Parameter,
  Place,
  SDCPN,
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
  components: Component[];
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
  /**
   * The source's components and defaults, and each component's lists, read once for
   * every instance to resolve.
   */
  index: DocumentIndex;
  target: MutableFlatSDCPN;
  parametersEnabled: boolean;
  flatIds: FlatIdSets;
  transitionParameterValues: Map<ID, ParameterValues>;
  placeParameterValues: Map<ID, ParameterValues>;
  arcPlaceNameOverrides: Map<string, string>;
  /** Every fusion of every net, as flat place ids, applied once flattening is done. */
  fusionGroups: FusionGroup[];
  /** For each flat equation, the `equationKey` of the equation it is a copy of. */
  equationKeys: Map<ID, string>;
  /**
   * What runs for the instances with one `bindingKey`, checked once: every
   * such instance asks, and every arc and fusion at its ports.
   */
  runningComponents: Map<string, RunningComponent>;
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

const netHasComponentPortArcs = (net: SDCPN | Component): boolean =>
  net.transitions.some((transition) =>
    [...transition.inputArcs, ...transition.outputArcs].some(
      (arc) => getArcEndpoint(arc).kind === "componentPort",
    ),
  );

/**
 * What runs for `instance`. Throws when nothing does, or when the bound
 * implementation falls short of its interface: the kernels around the
 * instance are compiled against the interface's ports.
 */
const requireRunningComponent = (
  ctx: FlattenContext,
  instance: ComponentInstance,
): RunningComponent => {
  const key = bindingKey(instance);
  const checked = ctx.runningComponents.get(key);
  if (checked) {
    return checked;
  }
  const binding = resolveImplementation(
    ctx.source,
    instance,
    undefined,
    ctx.index,
  );
  if (binding === null) {
    throw new Error(
      `Component instance \`${instance.name}\` references ${describeMissingComponent(instance.component)}.`,
    );
  }
  if (binding.kind === "unbound") {
    throw new Error(
      `Component instance \`${instance.name}\` has no implementation to run: ${describeUnboundInstance(binding, instance.name)}`,
    );
  }
  if (binding.kind === "bound") {
    const shortfall = checkImplementation(
      binding.implementation,
      binding.interface,
      indexImplementation(
        binding.implementation,
        ctx.index.componentIndex(binding.implementation),
      ),
      ctx.index.componentIndex(binding.interface),
    ).find(({ severity }) => severity === "error");
    if (shortfall) {
      throw new Error(
        `Component instance \`${instance.name}\` cannot run \`${binding.implementation.name}\`: ${shortfall.message}`,
      );
    }
  }
  const running = runningComponent(binding, ctx.index);
  ctx.runningComponents.set(key, running);
  return running;
};

/**
 * The flat place behind a port of one of `net`'s instances, for the arc or
 * the fusion `referrer` names. Throws when the instance, its component or the
 * port does not exist, and when the place is not marked as a port.
 */
const flatPortPlace = ({
  ctx,
  net,
  path,
  endpoint,
  referrer,
}: {
  ctx: FlattenContext;
  net: SDCPN | Component;
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

  const { declared, portId } = requireRunningComponent(ctx, instance);

  const port = declared.places.find(
    (place) => place.id === endpoint.portPlaceId,
  );
  if (!port) {
    throw new Error(
      `${referrer} references component port place ID \`${endpoint.portPlaceId}\` which does not exist in component \`${declared.name}\`.`,
    );
  }
  if (!port.isPort) {
    throw new Error(
      `${referrer} references component place \`${port.name}\`, but only places marked \`isPort\` can be used as component ports.`,
    );
  }

  return {
    instance,
    port,
    placeId: scopedId([...path, instance.id], portId(endpoint.portPlaceId)),
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
  net: SDCPN | Component;
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
  net: SDCPN | Component;
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
  net: SDCPN | Component;
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

/**
 * Adds the fusions of `net` to the context as groups of flat place ids.
 * Throws on a second anchor, a member two fusions share, and a member that
 * does not resolve.
 */
const collectFusionGroups = ({
  ctx,
  net,
  path,
  placeIdMap,
}: {
  ctx: FlattenContext;
  net: SDCPN | Component;
  path: readonly ID[];
  placeIdMap: ReadonlyMap<ID, ID>;
}): void => {
  // A place or port in two fusions would chain them, and with them their
  // anchors, into one place.
  const fusedEndpoints = new Set<string>();
  for (const fusion of net.fusions ?? []) {
    const label = `\`${fusion.name}\``;
    if (fusionMemberIssues(fusion.members).multipleAnchors) {
      throw new Error(
        `Fusion ${label} holds more than one place of its net: they would become one place.`,
      );
    }
    for (const key of new Set(fusion.members.map(getArcEndpointKey))) {
      if (fusedEndpoints.has(key)) {
        throw new Error(
          `Fusion ${label} shares a member with another fusion of its net: a place or port belongs to one fusion.`,
        );
      }
      fusedEndpoints.add(key);
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
    ctx.fusionGroups.push({ name: fusion.name, placeIds });
  }
};

const flattenNet = ({
  ctx,
  net,
  path,
  activeComponentIds,
  parameterValues,
}: {
  ctx: FlattenContext;
  net: SDCPN | Component;
  path: readonly ID[];
  activeComponentIds: readonly ID[];
  parameterValues: ParameterValues;
}): void => {
  // The net being flattened: the component entered last, `null` for the root
  // net.
  const netId = activeComponentIds.at(-1) ?? null;
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
    ctx.equationKeys.set(id, equationKey(netId, equation.id));
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
    const { declared, running, parameterId } = requireRunningComponent(
      ctx,
      instance,
    );
    if (activeComponentIds.includes(running.id)) {
      const nameOf = (componentId: ID) =>
        ctx.source.components?.find(({ id }) => id === componentId)?.name ??
        componentId;
      throw new Error(
        `Component component cycle detected: ${[
          ...activeComponentIds,
          running.id,
        ]
          .map((componentId) => `\`${nameOf(componentId)}\``)
          .join(" -> ")}.`,
      );
    }
    // The instance's values are keyed by the declared component's parameter
    // ids, and a parameter it leaves alone has the declared default: what the
    // instance's properties show. The running component's parameters of the same
    // variable names take them, and its other parameters keep their own.
    const runningParameterValues = Object.fromEntries(
      declared.parameters.map((parameter) => [
        parameterId(parameter.id),
        getOwn(instance.parameterValues, parameter.id) ??
          parameter.defaultValue,
      ]),
    );
    flattenNet({
      ctx,
      net: running,
      path: [...path, instance.id],
      activeComponentIds: [...activeComponentIds, running.id],
      parameterValues: ctx.parametersEnabled
        ? deriveInstanceParameterValues(
            running.parameters,
            runningParameterValues,
          )
        : {},
    });
  }

  collectFusionGroups({ ctx, net, path, placeIdMap });
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

  // A fusion in a net without instances is still refused: the full pass
  // throws on it.
  if (
    (sdcpn.componentInstances ?? []).length === 0 &&
    (sdcpn.fusions ?? []).length === 0 &&
    !hasRootComponentPortArcs
  ) {
    let hasNestedInstances = false;
    for (const component of sdcpn.components ?? []) {
      if ((component.componentInstances ?? []).length > 0) {
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
    components: [],
    componentInstances: [],
  };

  const ctx: FlattenContext = {
    source: sdcpn,
    index: indexDocument(sdcpn),
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
    equationKeys: new Map(),
    runningComponents: new Map(),
  };

  flattenNet({
    ctx,
    net: sdcpn,
    path: [],
    activeComponentIds: [],
    parameterValues: rootParameterValues,
  });

  const { aliases: fusedPlaceAliases, dynamicsDonors } = applyFusions(
    target,
    ctx.fusionGroups,
    ctx.equationKeys,
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

  // Keyed by place ids from stored run inputs: no prototype.
  const flatInitialMarking: InitialMarking = createUserKeyedRecord();
  for (const [placeId, value] of Object.entries(initialMarking)) {
    const fusedId = fusedPlaceAliases.get(placeId);
    if (fusedId === undefined) {
      flatInitialMarking[placeId] = value;
    } else if (!Object.hasOwn(initialMarking, fusedId)) {
      // A marking on a merged place lands on the fused place, unless the
      // fused place has one of its own.
      flatInitialMarking[fusedId] ??= value;
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
