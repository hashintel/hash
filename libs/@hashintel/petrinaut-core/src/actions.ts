import {
  colorSchema,
  componentInstanceSchema,
  differentialEquationSchema,
  fusionSchema,
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
  arcEndpointsEqual,
  arcMatchesEndpoint,
  createArcEndpointReference,
  getArcEndpoint,
  getArcEndpointKey,
  getComponentPortEndpointSubnet,
  placeArcEndpoint,
} from "./arc-endpoints";
import { generateArcId } from "./arc-id";
import {
  findFusionWithMember,
  fusionHolds,
  nextFusionName,
} from "./composition/fusions";
import {
  componentOf,
  describeMissingComponent,
  describeUnboundInstance,
  isInterface,
  resolveBinding,
  resolveComponent,
  sameComponent,
} from "./composition/interfaces";
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
import { toPetrinautId } from "./petrinaut-id";
import {
  getPlaceDynamicsEquationIds,
  placeUsesDifferentialEquation,
  withoutDifferentialEquations,
} from "./place-dynamics";
import { migrateScenarioRowsForTypeEdit } from "./schema-migration";

import type { ResolvedLibraries } from "./composition/libraries";
import type {
  ArcEndpoint,
  Color,
  ComponentInstance,
  ComponentReference,
  DefaultImplementation,
  Fusion,
  FusionMember,
  ID,
  InputArc,
  OutputArc,
  SDCPN,
  Subnet,
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
  /**
   * The libraries the document's imports resolved to, as they stand when a
   * mutation runs. A mutation that names a component of an import needs its
   * library among them.
   */
  libraries?: () => ResolvedLibraries;
};

type Libraries = ResolvedLibraries | undefined;

type TargetableInput = {
  targetSubnetId?: string | null;
};

type MutableNet = Pick<
  SDCPN,
  "places" | "transitions" | "types" | "differentialEquations" | "parameters"
> & {
  componentInstances?: ComponentInstance[];
  fusions?: Fusion[];
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

const getTypeById = (
  sdcpn: SDCPN,
  net: MutableNet,
  libraries: Libraries,
): Map<string, Color> =>
  new Map(
    [
      ...[...(libraries?.values() ?? [])].flatMap(({ components }) =>
        components.flatMap((component) => component.types),
      ),
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
  libraries,
}: {
  transition: SDCPN["transitions"][number];
  sdcpn: SDCPN;
  net: MutableNet;
  extensions: PetrinautExtensionSettings;
  libraries: Libraries;
}): {
  inputs: TransitionTemplateArc[];
  outputs: TransitionTemplateArc[];
} => {
  const resolveArcPlace = createArcPlaceResolver(sdcpn, net, {
    componentPortsEnabled: extensions.subnets,
    libraries,
  });
  const typeById = getTypeById(sdcpn, net, libraries);

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

const getFusions = (net: MutableNet): Fusion[] => {
  const fusions = net.fusions ?? [];
  const targetNet = net;
  targetNet.fusions = fusions;
  return fusions;
};

/**
 * Assigns the fields of `update` to `target`. A field given as `undefined`
 * is cleared: absent is its unset state, so the key goes rather than holding
 * `undefined`.
 */
const assignUpdate = <Target extends object>(
  target: Target,
  update: Partial<Target>,
): void => {
  const assigned = target;
  for (const key of Object.keys(update) as (keyof Target)[]) {
    const value = update[key];
    if (value === undefined) {
      delete assigned[key];
    } else {
      assigned[key] = value;
    }
  }
};

const getAllMutableNets = (sdcpn: SDCPN): MutableNet[] => [
  sdcpn,
  ...(sdcpn.subnets ?? []),
];

/** Removes the items `matches` picks, in place. Returns whether it picked any. */
const removeWhere = <Item>(
  items: Item[],
  matches: (item: Item) => boolean,
): boolean => {
  let removed = false;
  for (let index = items.length - 1; index >= 0; index--) {
    if (matches(items[index]!)) {
      items.splice(index, 1);
      removed = true;
    }
  }
  return removed;
};

/**
 * Drops the fusions among `shrunk`, the ones an edit took a member from, that
 * are left with fewer than two members, and the list once it is empty. A
 * fusion the edit did not shrink stays whatever its size: a document can be
 * loaded with a fusion of one member, which the checks report and an edit of
 * that fusion repairs.
 */
const pruneFusions = (
  net: MutableNet,
  shrunk: ReadonlySet<Fusion> = new Set(),
): void => {
  if (!net.fusions) {
    return;
  }
  removeWhere(
    net.fusions,
    (fusion) => shrunk.has(fusion) && fusion.members.length < 2,
  );
  if (net.fusions.length === 0) {
    const targetNet = net;
    delete targetNet.fusions;
  }
};

type EndpointTest = (endpoint: ArcEndpoint) => boolean;

/**
 * Drops what in `net` names a place `matches` picks: the arcs onto it and
 * its membership of a fusion.
 */
const removeEndpointReferences = (
  net: MutableNet,
  matches: EndpointTest,
): void => {
  for (const transition of net.transitions) {
    removeWhere(transition.inputArcs, (arc) => matches(getArcEndpoint(arc)));
    removeWhere(transition.outputArcs, (arc) => matches(getArcEndpoint(arc)));
  }
  const shrunk = new Set<Fusion>();
  for (const fusion of net.fusions ?? []) {
    if (removeWhere(fusion.members, matches)) {
      shrunk.add(fusion);
    }
  }
  pruneFusions(net, shrunk);
};

const removeReferencesToPlace = (net: MutableNet, placeId: string): void =>
  removeEndpointReferences(
    net,
    (endpoint) => endpoint.kind === "place" && endpoint.placeId === placeId,
  );

/** Whether anything in `net` names a place `matches` picks: an arc or a fusion member. */
const hasEndpointReferences = (
  net: MutableNet,
  matches: EndpointTest,
): boolean =>
  net.transitions.some(({ inputArcs, outputArcs }) =>
    [...inputArcs, ...outputArcs].some((arc) => matches(getArcEndpoint(arc))),
  ) || (net.fusions ?? []).some((fusion) => fusion.members.some(matches));

/** Picks the ports of the instance `componentInstanceId`. */
const onInstance =
  (componentInstanceId: string): EndpointTest =>
  (endpoint) =>
    endpoint.kind === "componentPort" &&
    endpoint.componentInstanceId === componentInstanceId;

const removeReferencesToComponentInstance = (
  net: MutableNet,
  componentInstanceId: string,
): void => removeEndpointReferences(net, onInstance(componentInstanceId));

/**
 * Picks `portPlaceId` on the instances of `subnetId` that `net` holds; `null`
 * when it holds none.
 */
const onSubnetPort = (
  net: MutableNet,
  subnetId: string,
  portPlaceId: string,
): EndpointTest | null => {
  const instanceIds = new Set(
    (net.componentInstances ?? [])
      .filter((instance) => instance.subnetId === subnetId)
      .map((instance) => instance.id),
  );
  return instanceIds.size === 0
    ? null
    : (endpoint) =>
        endpoint.kind === "componentPort" &&
        endpoint.portPlaceId === portPlaceId &&
        instanceIds.has(endpoint.componentInstanceId);
};

/** Drops what names `portPlaceId` on an instance of `subnetId`, in every net. */
const removeReferencesToSubnetPort = (
  sdcpn: SDCPN,
  subnetId: string,
  portPlaceId: string,
): void => {
  for (const net of getAllMutableNets(sdcpn)) {
    const matches = onSubnetPort(net, subnetId, portPlaceId);
    if (matches) {
      removeEndpointReferences(net, matches);
    }
  }
};

/** Whether an update of `instance` points it at a component other than its own. */
const namesAnotherComponent = (
  instance: ComponentInstance,
  update: Pick<Partial<ComponentInstance>, "subnetId" | "component">,
): boolean =>
  (update.subnetId !== undefined || update.component !== undefined) &&
  !sameComponent(componentOf(update), componentOf(instance));

/**
 * Whether a call of `action` with `input` would drop arcs or fusion
 * memberships from `sdcpn`: an `updatePlace` that unmarks a port something
 * outside its subnet still names, or an `updateComponentInstance` that points
 * an instance at another component while something names its ports. A caller
 * that asks before a removal asks before such an update. Throws on an input
 * the action does not accept.
 */
export const updatePrunesReferences = (
  sdcpn: SDCPN,
  action: string,
  input: unknown,
): boolean => {
  if (action === "updatePlace") {
    const { placeId, update, targetSubnetId } =
      mutationActionInputSchemas.updatePlace.parse(input);
    if (!targetSubnetId) {
      return false;
    }
    const place = sdcpn.subnets
      ?.find(({ id }) => id === targetSubnetId)
      ?.places.find(({ id }) => id === placeId);
    // As `updatePlace` runs: a place of a subnet that stops being a port.
    return (
      place?.isPort === true &&
      { ...place, ...update }.isPort !== true &&
      getAllMutableNets(sdcpn).some((net) => {
        const matches = onSubnetPort(net, targetSubnetId, placeId);
        return matches !== null && hasEndpointReferences(net, matches);
      })
    );
  }
  if (action === "updateComponentInstance") {
    const { instanceId, update, targetSubnetId } =
      mutationActionInputSchemas.updateComponentInstance.parse(input);
    const net: MutableNet | undefined = targetSubnetId
      ? sdcpn.subnets?.find(({ id }) => id === targetSubnetId)
      : sdcpn;
    const instance = net?.componentInstances?.find(
      ({ id }) => id === instanceId,
    );
    // As `updateComponentInstance` runs: an instance given another component.
    return (
      net !== undefined &&
      instance !== undefined &&
      namesAnotherComponent(instance, update) &&
      hasEndpointReferences(net, onInstance(instanceId))
    );
  }
  return false;
};

/**
 * Moves the members of any other fusion of `net` holding one of `members`
 * into `fusion`, and removes that other fusion: fused places are one place,
 * so two fusions sharing a member are one fusion.
 */
const absorbFusionsSharingMembers = (
  net: MutableNet,
  fusion: Pick<Fusion, "id" | "members">,
  members: readonly FusionMember[],
): void => {
  for (const member of members) {
    const other = findFusionWithMember(net, member);
    if (!other || other.id === fusion.id) {
      continue;
    }
    for (const otherMember of other.members) {
      if (!fusionHolds(fusion, otherMember)) {
        fusion.members.push(otherMember);
      }
    }
    removeWhere(net.fusions ?? [], (held) => held === other);
  }
};

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

const removeComponentInstancesReferencingSubnet = (
  sdcpn: SDCPN,
  subnetId: string,
): void => {
  for (const net of getAllMutableNets(sdcpn)) {
    const instances = net.componentInstances ?? [];
    for (const instance of instances) {
      if (instance.subnetId === subnetId) {
        removeReferencesToComponentInstance(net, instance.id);
      }
    }
    removeWhere(instances, (instance) => instance.subnetId === subnetId);
  }
};

/**
 * Throws when an endpoint names a place or a port that is not in `net`.
 * `referrer` is what holds the endpoint, for the message: an arc, a fusion.
 */
const assertEndpointReferences = (
  sdcpn: SDCPN,
  net: MutableNet,
  endpoint: ArcEndpoint,
  referrer: "Arc" | "Fusion",
  libraries: Libraries,
): void => {
  if (endpoint.kind === "place") {
    if (!net.places.some((place) => place.id === endpoint.placeId)) {
      throw new Error(
        `${referrer} references place ID \`${endpoint.placeId}\` which does not exist in the target net.`,
      );
    }
    return;
  }

  const instance = (net.componentInstances ?? []).find(
    (candidate) => candidate.id === endpoint.componentInstanceId,
  );
  if (!instance) {
    throw new Error(
      `${referrer} references component instance ID \`${endpoint.componentInstanceId}\` which does not exist in the target net.`,
    );
  }

  const subnet = getComponentPortEndpointSubnet(sdcpn, instance, libraries);
  if (!subnet) {
    throw new Error(
      `${referrer} references component instance \`${instance.name}\`, which names ${describeMissingComponent(componentOf(instance))}.`,
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
};

/** Drops the document's default implementations `drop` picks, and the list once it is empty. */
const dropImplementations = (
  sdcpn: SDCPN,
  drop: (entry: DefaultImplementation) => boolean,
): void => {
  const targetSdcpn = sdcpn;
  if (!targetSdcpn.implementations) {
    return;
  }
  removeWhere(targetSdcpn.implementations, drop);
  if (targetSdcpn.implementations.length === 0) {
    delete targetSdcpn.implementations;
  }
};

/**
 * Drops the instance choices and document defaults that name `subnetId`, as
 * the interface or as the implementation, and do not resolve.
 */
const pruneImplementationBindings = (
  sdcpn: SDCPN,
  subnetId: ID,
  libraries: Libraries,
): void => {
  const subnet: ComponentReference = { id: subnetId };
  const broken = (
    iface: ComponentReference,
    implementation: ComponentReference,
  ) =>
    (sameComponent(iface, subnet) || sameComponent(implementation, subnet)) &&
    resolveBinding(sdcpn, iface, implementation, libraries)?.kind !== "bound";
  for (const net of getAllMutableNets(sdcpn)) {
    for (const instance of net.componentInstances ?? []) {
      if (
        instance.implementation !== undefined &&
        broken(componentOf(instance), instance.implementation)
      ) {
        delete instance.implementation;
      }
    }
  }
  dropImplementations(sdcpn, (entry) =>
    broken(entry.interface, entry.component),
  );
};

/** Throws when `subnet` says it implements something that is no interface of the document. */
const assertImplementsReferences = (
  sdcpn: SDCPN,
  subnet: Pick<Subnet, "name" | "implements">,
): void => {
  for (const interfaceId of subnet.implements ?? []) {
    const iface = sdcpn.subnets?.find(({ id }) => id === interfaceId);
    if (!iface) {
      throw new Error(
        `Subnet \`${subnet.name}\` implements subnet ID \`${interfaceId}\` which does not exist.`,
      );
    }
    if (!isInterface(iface)) {
      throw new Error(
        `Subnet \`${subnet.name}\` implements \`${iface.name}\`, which is not an interface.`,
      );
    }
  }
};

/** Throws when `subnet` is an interface that says it implements one. */
const assertInterfaceImplementsNone = (
  subnet: Pick<Subnet, "name" | "interface" | "implements">,
): void => {
  if (isInterface(subnet) && (subnet.implements?.length ?? 0) > 0) {
    throw new Error(
      `Subnet \`${subnet.name}\` is an interface, and an interface cannot implement an interface.`,
    );
  }
};

/** Takes `subnetId` out of every `implements` list that names it. */
const removeFromImplementsLists = (sdcpn: SDCPN, subnetId: ID): void => {
  for (const subnet of sdcpn.subnets ?? []) {
    if (subnet.implements?.includes(subnetId)) {
      const remaining = subnet.implements.filter((id) => id !== subnetId);
      if (remaining.length > 0) {
        subnet.implements = remaining;
      } else {
        delete subnet.implements;
      }
    }
  }
};

/** The fusion of `net` with this id. Throws when there is none. */
const requireFusion = (net: MutableNet, fusionId: string): Fusion => {
  const fusion = (net.fusions ?? []).find(({ id }) => id === fusionId);
  if (!fusion) {
    throw new Error(
      `Fusion ID \`${fusionId}\` does not exist in the target net.`,
    );
  }
  return fusion;
};

/**
 * Adds `member` to `fusion`, with the members of any other fusion of `net`
 * that holds it.
 */
const joinFusion = (
  sdcpn: SDCPN,
  net: MutableNet,
  fusion: Fusion,
  member: FusionMember,
  libraries: Libraries,
): void => {
  assertEndpointReferences(sdcpn, net, member, "Fusion", libraries);
  absorbFusionsSharingMembers(net, fusion, [member]);
  if (!fusionHolds(fusion, member)) {
    fusion.members.push(member);
  }
};

const assertComponentInstanceReferences = (
  sdcpn: SDCPN,
  instance: ComponentInstance,
  libraries: Libraries,
): void => {
  const reference = componentOf(instance);
  const subnet = resolveComponent(sdcpn, reference, libraries);
  if (!subnet) {
    throw new Error(
      `Component instance \`${instance.name}\` references ${describeMissingComponent(reference)}.`,
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
 * Throws unless `implementation` can run for instances of `iface`.
 * `subject` is what names it, and opens the message.
 */
const assertBindingRuns = (
  sdcpn: SDCPN,
  iface: ComponentReference,
  implementation: ComponentReference,
  subject: string,
  libraries: Libraries,
): void => {
  const resolved = resolveBinding(sdcpn, iface, implementation, libraries);
  if (resolved === null) {
    throw new Error(
      `${subject} names an implementation for ${describeMissingComponent(iface)}.`,
    );
  }
  if (resolved.kind === "component") {
    throw new Error(
      `${subject} names an implementation, but \`${resolved.subnet.name}\` is not an interface.`,
    );
  }
  if (resolved.kind === "unbound") {
    throw new Error(describeUnboundInstance(resolved, subject));
  }
};

/** Throws when the implementation an instance names cannot run for it. */
const assertImplementationChoice = (
  sdcpn: SDCPN,
  instance: ComponentInstance,
  libraries: Libraries,
): void => {
  if (instance.implementation !== undefined) {
    assertBindingRuns(
      sdcpn,
      componentOf(instance),
      instance.implementation,
      `Component instance \`${instance.name}\``,
      libraries,
    );
  }
};

/**
 * Lists the imports an instance names, for its component and for the
 * implementation it chose, unless the document does already.
 */
const ensureImports = (sdcpn: SDCPN, instance: ComponentInstance): void => {
  for (const reference of [instance.component, instance.implementation]) {
    const from = reference?.from;
    if (from !== undefined && !sdcpn.imports?.some(({ id }) => id === from)) {
      const targetSdcpn = sdcpn;
      targetSdcpn.imports ??= [];
      targetSdcpn.imports.push({ id: from });
    }
  }
};

/**
 * Validate that the differential equations a place composes are consistent:
 * each equation must exist, the place must have a colour, and each
 * equation's `colorId` must match the place's `colorId`. Throws a descriptive error when the invariant
 * is violated; otherwise no-ops.
 *
 * Mirrors the runtime invariant enforced by the simulation engine, but raises
 * at mutation time so AI callers see the failure immediately instead of at
 * simulation build.
 */
function assertPlaceDynamicsReferences(
  place: SDCPN["places"][number],
  equations: SDCPN["differentialEquations"],
): void {
  for (const equationId of getPlaceDynamicsEquationIds(place)) {
    const equation = equations.find((eq) => eq.id === equationId);
    if (!equation) {
      throw new Error(
        `Place \`${place.name}\` references differential equation ID \`${equationId}\` which does not exist.`,
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
}

const collectWrittenIds = (
  value: unknown,
  written: Map<string, string>,
): void => {
  if (typeof value === "string") {
    const converted = toPetrinautId(value);
    if (converted !== value) {
      written.set(converted, value);
    }
  } else if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) {
      collectWrittenIds(item, written);
    }
  }
};

/** Errors name an input id as the caller wrote it, not the UUID it became. */
const withWrittenIdsInErrors = (
  actions: MutationHelperFunctions,
): MutationHelperFunctions =>
  Object.fromEntries(
    Object.entries(actions).map(([name, action]) => [
      name,
      (input: unknown) => {
        try {
          action(input as never);
        } catch (error) {
          if (error instanceof Error) {
            const written = new Map<string, string>();
            collectWrittenIds(input, written);
            for (const [converted, id] of written) {
              error.message = error.message.replaceAll(converted, id);
            }
          }
          throw error;
        }
      },
    ]),
  ) as MutationHelperFunctions;

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
  const readLibraries = (): Libraries => options.libraries?.();

  const sanitizeTransition = (
    transition: SDCPN["transitions"][number],
    net: MutableNet,
    sdcpn: SDCPN,
    sanitizeOptions: { loadDefaultKernelWhenEmpty?: boolean } = {},
  ): void => {
    const libraries = readLibraries();
    Object.assign(
      transition,
      sanitizeTransitionForExtensions(
        transition,
        sdcpn,
        extensions,
        net,
        libraries,
      ),
    );

    if (
      sanitizeOptions.loadDefaultKernelWhenEmpty &&
      transition.transitionKernelCode.trim() === "" &&
      getTransitionLogicAvailability(
        transition,
        sdcpn,
        extensions,
        net,
        libraries,
      ).transitionKernel
    ) {
      const { inputs, outputs } = getTransitionTemplateArcs({
        transition,
        sdcpn,
        net,
        extensions,
        libraries,
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

  return withWrittenIdsInErrors({
    addPlace(input) {
      const parsed = mutationActionInputSchemas.addPlace.parse(input);
      const [targetSubnetId, place] = splitTargetSubnetId(parsed);
      const parsedPlace = sanitizePlaceForExtensions(
        placeSchema.parse(place),
        extensions,
      );
      // A direction belongs to a port: a place that is none carries none.
      if (parsedPlace.isPort !== true) {
        delete parsedPlace.portDirection;
      }
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
            const wasPort = place.isPort === true;
            assignUpdate(place, parsed.update);
            // A direction belongs to a port: unmarking the port removes it.
            if (place.isPort !== true) {
              delete place.portDirection;
            }
            Object.assign(place, sanitizePlaceForExtensions(place, extensions));
            placeSchema.parse(place);
            assertPlaceDynamicsReferences(place, net.differentialEquations);
            // A place that stops being a port can no longer be reached from
            // outside its subnet: the arcs and fusions on it go with it.
            if (wasPort && place.isPort !== true && parsed.targetSubnetId) {
              removeReferencesToSubnetPort(
                sdcpn,
                parsed.targetSubnetId,
                place.id,
              );
            }
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

            removeReferencesToPlace(net, parsed.placeId);
            if (parsed.targetSubnetId) {
              removeReferencesToSubnetPort(
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
        assertEndpointReferences(sdcpn, net, endpoint, "Arc", readLibraries());
        const transition = net.transitions.find(
          (candidate) => candidate.id === parsed.transitionId,
        );
        if (transition === undefined) {
          throw new Error(
            `Arc references transition ID \`${parsed.transitionId}\` which does not exist in the target net.`,
          );
        }
        if (parsed.arcDirection === "input") {
          if (
            transition.inputArcs.some((arc) =>
              arcMatchesEndpoint(arc, endpoint),
            )
          ) {
            return;
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
            return;
          }
          transition.outputArcs.push({
            ...createArcEndpointReference(endpoint),
            weight: parsed.weight,
          });
        }
        sanitizeTransition(transition, net, sdcpn, {
          loadDefaultKernelWhenEmpty: true,
        });
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
        assertEndpointReferences(
          sdcpn,
          net,
          newEndpoint,
          "Arc",
          readLibraries(),
        );
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
          if (placeUsesDifferentialEquation(place, parsedEquation.id)) {
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
              if (placeUsesDifferentialEquation(place, equation.id)) {
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
        const removed = new Set([parsed.equationId]);
        net.places = net.places.map((place) =>
          withoutDifferentialEquations(place, removed),
        );
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
        assertInterfaceImplementsNone(parsedSubnet);
        assertImplementsReferences(sdcpn, parsedSubnet);
        const targetSdcpn = sdcpn;
        targetSdcpn.subnets ??= [];
        const subnets = targetSdcpn.subnets;
        subnets.push(parsedSubnet);
      });
    },
    updateSubnet(input) {
      const parsed = mutationActionInputSchemas.updateSubnet.parse(input);
      // The flag is `true` or absent on a subnet: `false` clears it.
      const { interface: flag, ...fields } = parsed.update;
      const update: Partial<Subnet> =
        "interface" in parsed.update
          ? { ...fields, interface: flag === true ? true : undefined }
          : fields;
      mutateWithExtensionGuards((sdcpn) => {
        for (const subnet of sdcpn.subnets ?? []) {
          if (subnet.id === parsed.subnetId) {
            const wasInterface = isInterface(subnet);
            assignUpdate(subnet, update);
            // Without its fusions, which an update leaves alone: a loaded
            // document can hold one the mutations refuse, for the checks to
            // report.
            subnetSchema.parse({ ...subnet, fusions: undefined });
            if (update.implements !== undefined) {
              assertImplementsReferences(sdcpn, subnet);
            }
            // A subnet that stops being an interface is implemented by none.
            if (wasInterface && !isInterface(subnet)) {
              removeFromImplementsLists(sdcpn, subnet.id);
            }
            // Only a change to what bindings rest on is held to the rule, and
            // drops the bindings it leaves unresolved: what a document was
            // loaded with outlives any other update, for the user to repair.
            if ("interface" in update || "implements" in update) {
              assertInterfaceImplementsNone(subnet);
              pruneImplementationBindings(sdcpn, subnet.id, readLibraries());
            }
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
            removeFromImplementsLists(sdcpn, subnetId);
            pruneImplementationBindings(sdcpn, subnetId, readLibraries());
            break;
          }
        }
      });
    },
    setImplementation(input) {
      const { interfaceId, implementationId } =
        mutationActionInputSchemas.setImplementation.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        const iface: ComponentReference = { id: interfaceId };
        const component =
          implementationId === null ? null : { id: implementationId };
        if (component) {
          assertBindingRuns(
            sdcpn,
            iface,
            component,
            "The document's default",
            readLibraries(),
          );
        }
        // An interface has one entry: what it had goes, with any double a
        // document was loaded with.
        dropImplementations(sdcpn, (entry) =>
          sameComponent(entry.interface, iface),
        );
        if (component) {
          const targetSdcpn = sdcpn;
          targetSdcpn.implementations ??= [];
          targetSdcpn.implementations.push({ interface: iface, component });
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
        const libraries = readLibraries();
        assertComponentInstanceReferences(sdcpn, parsedInstance, libraries);
        assertImplementationChoice(sdcpn, parsedInstance, libraries);
        ensureImports(sdcpn, parsedInstance);
        getComponentInstances(net).push(parsedInstance);
      });
    },
    updateComponentInstance(input) {
      const parsed =
        mutationActionInputSchemas.updateComponentInstance.parse(input);
      // The choice is a reference or absent on an instance: `null` clears it.
      const { implementation, ...fields } = parsed.update;
      const update: Partial<ComponentInstance> =
        "implementation" in parsed.update
          ? { ...fields, implementation: implementation ?? undefined }
          : fields;
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        for (const instance of net.componentInstances ?? []) {
          if (instance.id === parsed.instanceId) {
            const libraries = readLibraries();
            // Ports belong to the component: an instance pointed at another
            // one keeps no arc and no fusion on the ports of the old one.
            if (namesAnotherComponent(instance, update)) {
              removeReferencesToComponentInstance(net, instance.id);
              // Nor its choice of implementation, unless the update makes
              // one.
              delete instance.implementation;
              // It names its component one way: the update's.
              delete instance.subnetId;
              delete instance.component;
            }
            assignUpdate(instance, update);
            componentInstanceSchema.parse(instance);
            assertComponentInstanceReferences(sdcpn, instance, libraries);
            // A choice the document was loaded with is left for the user to
            // repair: only an update that makes one is held to the rule.
            if (update.implementation !== undefined) {
              assertImplementationChoice(sdcpn, instance, libraries);
            }
            ensureImports(sdcpn, instance);
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
            removeReferencesToComponentInstance(net, instance.id);
            instances.splice(index, 1);
            break;
          }
        }
      });
    },
    addFusion(input) {
      const parsed = mutationActionInputSchemas.addFusion.parse(input);
      const [targetSubnetId, { name, ...given }] = splitTargetSubnetId(parsed);
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, targetSubnetId);
        for (const member of given.members) {
          assertEndpointReferences(
            sdcpn,
            net,
            member,
            "Fusion",
            readLibraries(),
          );
        }
        const fusions = getFusions(net);
        if (fusions.some(({ id }) => id === given.id)) {
          throw new Error(
            `Fusion ID \`${given.id}\` already exists in the target net.`,
          );
        }
        // Its own member list: absorbing appends to it.
        const absorbing = { ...given, members: [...given.members] };
        absorbFusionsSharingMembers(net, absorbing, given.members);
        // Named once the fusions it absorbed are gone, so their numbers are
        // free. Parsed whole: absorbing can bring a second place of the net.
        fusions.push(
          fusionSchema.parse({
            ...absorbing,
            name: name ?? nextFusionName(fusions),
          }),
        );
      });
    },
    updateFusion(input) {
      const parsed = mutationActionInputSchemas.updateFusion.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        for (const fusion of net.fusions ?? []) {
          if (fusion.id === parsed.fusionId) {
            assignUpdate(fusion, parsed.update);
            break;
          }
        }
      });
    },
    removeFusion(input) {
      const parsed = mutationActionInputSchemas.removeFusion.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        removeWhere(net.fusions ?? [], ({ id }) => id === parsed.fusionId);
        pruneFusions(net);
      });
    },
    addFusionMember(input) {
      const parsed = mutationActionInputSchemas.addFusionMember.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        const fusion = requireFusion(net, parsed.fusionId);
        joinFusion(sdcpn, net, fusion, parsed.member, readLibraries());
        fusionSchema.parse(fusion);
      });
    },
    removeFusionMember(input) {
      const parsed = mutationActionInputSchemas.removeFusionMember.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        const fusion = (net.fusions ?? []).find(
          ({ id }) => id === parsed.fusionId,
        );
        if (!fusion) {
          return;
        }
        const shrunk = removeWhere(fusion.members, (member) =>
          arcEndpointsEqual(member, parsed.member),
        );
        pruneFusions(net, new Set(shrunk ? [fusion] : []));
      });
    },
    replaceFusionMember(input) {
      const parsed =
        mutationActionInputSchemas.replaceFusionMember.parse(input);
      mutateWithExtensionGuards((sdcpn) => {
        const net = resolveTargetNet(sdcpn, parsed.targetSubnetId);
        const fusion = requireFusion(net, parsed.fusionId);
        const holds = (member: FusionMember) =>
          fusion.members.some((held) => arcEndpointsEqual(held, member));
        if (!holds(parsed.member)) {
          throw new Error(
            `Fusion ID \`${parsed.fusionId}\` does not hold the member to replace.`,
          );
        }
        if (holds(parsed.replacement)) {
          throw new Error(
            `Fusion ID \`${parsed.fusionId}\` already holds the replacement. Remove the member instead.`,
          );
        }
        joinFusion(sdcpn, net, fusion, parsed.replacement, readLibraries());
        removeWhere(fusion.members, (member) =>
          arcEndpointsEqual(member, parsed.member),
        );
        fusionSchema.parse(fusion);
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
        const fusionIds = new Set<string>();
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
            case "fusion":
              fusionIds.add(id);
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

        removeWhere(net.transitions, ({ id }) => transitionIds.has(id));

        if (arcIds.size > 0) {
          for (const transition of net.transitions) {
            removeWhere(transition.inputArcs, (arc) =>
              arcIds.has(
                generateArcId({
                  inputId: getArcEndpointKey(getArcEndpoint(arc)),
                  outputId: transition.id,
                }),
              ),
            );
            removeWhere(transition.outputArcs, (arc) =>
              arcIds.has(
                generateArcId({
                  inputId: transition.id,
                  outputId: getArcEndpointKey(getArcEndpoint(arc)),
                }),
              ),
            );
          }
        }

        if (placeIds.size > 0 || componentInstanceIds.size > 0) {
          // Arcs and fusion members on a deleted place or instance go with it.
          removeEndpointReferences(net, (endpoint) =>
            endpoint.kind === "place"
              ? placeIds.has(endpoint.placeId)
              : componentInstanceIds.has(endpoint.componentInstanceId),
          );
          if (parsed.targetSubnetId) {
            for (const placeId of placeIds) {
              removeReferencesToSubnetPort(
                sdcpn,
                parsed.targetSubnetId,
                placeId,
              );
            }
          }
          removeWhere(net.places, ({ id }) => placeIds.has(id));
          removeWhere(net.componentInstances ?? [], ({ id }) =>
            componentInstanceIds.has(id),
          );
        }

        if (fusionIds.size > 0) {
          removeWhere(net.fusions ?? [], ({ id }) => fusionIds.has(id));
          pruneFusions(net);
        }

        if (typeIds.size > 0) {
          removeWhere(net.types, ({ id }) => typeIds.has(id));
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
          removeWhere(net.differentialEquations, ({ id }) =>
            equationIds.has(id),
          );
          net.places = net.places.map((place) =>
            withoutDifferentialEquations(place, equationIds),
          );
        }

        removeWhere(net.parameters, ({ id }) => parameterIds.has(id));

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
  });
}
