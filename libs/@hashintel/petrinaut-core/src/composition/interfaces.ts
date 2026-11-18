/**
 * Interfaces: a subnet flagged `interface` is a signature, ports, types and
 * parameters with no body, that instances point at like any subnet. The
 * subnet that runs for such an instance is the implementation bound to it,
 * by the instance itself or by the document's defaults. `implements` on a
 * subnet says which interfaces it can stand behind, and `check-interfaces.ts`
 * holds it to their ports and parameters.
 */

import { effectivePortDirections } from "./ports";

import type {
  Color,
  ComponentInstance,
  ComponentReference,
  ID,
  Parameter,
  Place,
  PortDirection,
  SDCPN,
  Subnet,
} from "../types/sdcpn";

export const isInterface = (subnet: Pick<Subnet, "interface">): boolean =>
  subnet.interface === true;

/** Whether a subnet holds what an interface may not: a transition or an instance. */
export const hasBody = (
  subnet: Pick<Subnet, "transitions" | "componentInstances">,
): boolean =>
  subnet.transitions.length > 0 || (subnet.componentInstances?.length ?? 0) > 0;

/**
 * The component `reference` names, a subnet of the document, or `undefined`
 * when there is none. `subnetsById` is `indexSubnets(sdcpn)`, which saves a
 * search of the list.
 */
export const resolveComponent = (
  sdcpn: Pick<SDCPN, "subnets">,
  reference: ComponentReference,
  subnetsById?: ReadonlyMap<ID, Subnet>,
): Subnet | undefined =>
  subnetsById
    ? subnetsById.get(reference.id)
    : sdcpn.subnets?.find(({ id }) => id === reference.id);

/**
 * The component the document runs for an interface whose instance chooses
 * none. Of two entries for one interface the first applies, and
 * `check-interfaces.ts` reports the pair. `defaults` is
 * `indexDocument(sdcpn).defaults`, which saves a search of the list.
 */
export const defaultImplementation = (
  sdcpn: Pick<SDCPN, "implementations">,
  interfaceId: ID,
  defaults?: DocumentIndex["defaults"],
): ComponentReference | undefined =>
  defaults
    ? defaults.get(interfaceId)
    : sdcpn.implementations?.find((entry) => entry.interface.id === interfaceId)
        ?.component;

export const implementsInterface = (
  subnet: Pick<Subnet, "implements">,
  interfaceId: ID,
): boolean => subnet.implements?.includes(interfaceId) ?? false;

/**
 * The subnets that can run for `interfaceId`: the ones that declare they
 * implement it and are no interface themselves.
 */
export const implementationsOf = (
  sdcpn: Pick<SDCPN, "subnets">,
  interfaceId: ID,
): Subnet[] =>
  (sdcpn.subnets ?? []).filter(
    (subnet) =>
      !isInterface(subnet) && implementsInterface(subnet, interfaceId),
  );

/** Whether the instance names the implementation or the document's default does. */
type ChosenBy = "instance" | "document";

export type ImplementationBinding =
  | { kind: "component"; subnet: Subnet }
  | {
      kind: "bound";
      interface: Subnet;
      implementation: Subnet;
      chosenBy: ChosenBy;
    }
  | ({ kind: "unbound"; interface: Subnet } & (
      | { reason: "no-binding" }
      /** The binding names a component that does not exist. */
      | { reason: "missing"; reference: ComponentReference; chosenBy: ChosenBy }
      /** The binding names a subnet that cannot stand behind the interface. */
      | {
          reason: "is-interface" | "not-implementing";
          implementation: Subnet;
          chosenBy: ChosenBy;
        }
    ));

/**
 * `items` by id, for a caller that looks many of them up. Of two items with
 * one id the first is kept, as a search of the list finds it.
 */
export const indexById = <Item extends { id: ID }>(
  items: readonly Item[],
): Map<ID, Item> => {
  const itemsById = new Map<ID, Item>();
  for (const item of items) {
    if (!itemsById.has(item.id)) {
      itemsById.set(item.id, item);
    }
  }
  return itemsById;
};

/** The document's subnets by id, for a caller that resolves many instances. */
export const indexSubnets = (sdcpn: Pick<SDCPN, "subnets">): Map<ID, Subnet> =>
  indexById(sdcpn.subnets ?? []);

/** `read`, called once at most: what it gives is kept for the calls that follow. */
export const once = <Value>(read: () => Value): (() => Value) => {
  let kept: { value: Value } | undefined;
  return () => {
    kept ??= { value: read() };
    return kept.value;
  };
};

/**
 * What the checks and the flattener read of a subnet that stands behind an
 * interface: each of its lists by id, the directions of its ports, and what
 * the interface's ports and parameters are matched by. Each is read once,
 * when first asked for.
 */
export type SubnetIndex = {
  places: () => ReadonlyMap<ID, Place>;
  types: () => ReadonlyMap<ID, Color>;
  parameters: () => ReadonlyMap<ID, Parameter>;
  directions: () => ReadonlyMap<ID, PortDirection>;
  /** The id of its port of each name: of two ports with one name, the last. */
  portIdsByName: () => ReadonlyMap<string, ID>;
  /** The id of its parameter of each variable name: of two with one, the last. */
  parameterIdsByVariableName: () => ReadonlyMap<string, ID>;
};

export const indexSubnet = (subnet: Subnet): SubnetIndex => ({
  places: once(() => indexById(subnet.places)),
  types: once(() => indexById(subnet.types)),
  parameters: once(() => indexById(subnet.parameters)),
  directions: once(() => effectivePortDirections(subnet)),
  portIdsByName: once(
    () =>
      new Map(
        subnet.places
          .filter(({ isPort }) => isPort)
          .map(({ name, id }) => [name, id]),
      ),
  ),
  parameterIdsByVariableName: once(
    () =>
      new Map(
        subnet.parameters.map(({ variableName, id }) => [variableName, id]),
      ),
  ),
});

/**
 * The document's subnets by id and its default implementation by the id of
 * each interface, for a caller that resolves many instances. Of two defaults
 * for one interface the first is kept, as a search of the list finds it.
 */
export type DocumentIndex = {
  subnetsById: ReadonlyMap<ID, Subnet>;
  defaults: ReadonlyMap<ID, ComponentReference>;
  /**
   * `implementsInterface` for a subnet of the document, whose list of
   * interfaces is read once however many instances are bound to it.
   */
  implementsInterface: (
    subnet: Pick<Subnet, "id" | "implements">,
    interfaceId: ID,
  ) => boolean;
  /**
   * `indexSubnet` for a subnet of the document, whose lists are read once
   * however many interfaces it is held to and instances it runs for. A
   * subnet the document does not hold under its id is read for the call.
   */
  subnetIndex: (subnet: Subnet) => SubnetIndex;
};

export const indexDocument = (
  sdcpn: Pick<SDCPN, "subnets" | "implementations">,
): DocumentIndex => {
  const defaults = new Map<ID, ComponentReference>();
  for (const entry of sdcpn.implementations ?? []) {
    if (!defaults.has(entry.interface.id)) {
      defaults.set(entry.interface.id, entry.component);
    }
  }
  const implementedBySubnetId = new Map<ID, ReadonlySet<ID>>();
  const subnetsById = indexSubnets(sdcpn);
  const subnetIndexes = new Map<ID, SubnetIndex>();
  return {
    subnetsById,
    defaults,
    implementsInterface: (subnet, interfaceId) => {
      let implemented = implementedBySubnetId.get(subnet.id);
      if (!implemented) {
        implemented = new Set(subnet.implements);
        implementedBySubnetId.set(subnet.id, implemented);
      }
      return implemented.has(interfaceId);
    },
    subnetIndex: (subnet) => {
      if (subnetsById.get(subnet.id) !== subnet) {
        return indexSubnet(subnet);
      }
      let index = subnetIndexes.get(subnet.id);
      if (!index) {
        index = indexSubnet(subnet);
        subnetIndexes.set(subnet.id, index);
      }
      return index;
    },
  };
};

/**
 * The subnet that runs for `instance`: its own subnet when that is a
 * component; for an interface, the implementation the instance chose, else
 * the document's default. `null` when the instance's subnet does not exist.
 * `index` is `indexDocument(sdcpn)`, which saves a search of the document's
 * subnets and of its defaults for each instance.
 */
export const resolveImplementation = (
  sdcpn: Pick<SDCPN, "subnets" | "implementations">,
  instance: Pick<ComponentInstance, "subnetId" | "implementation">,
  index?: DocumentIndex,
): ImplementationBinding | null => {
  const declared = resolveComponent(
    sdcpn,
    { id: instance.subnetId },
    index?.subnetsById,
  );
  if (!declared) {
    return null;
  }
  if (!isInterface(declared)) {
    return { kind: "component", subnet: declared };
  }
  const unbound = { kind: "unbound", interface: declared } as const;
  const reference =
    instance.implementation ??
    defaultImplementation(sdcpn, declared.id, index?.defaults);
  if (reference === undefined) {
    return { ...unbound, reason: "no-binding" };
  }
  const chosenBy =
    instance.implementation === undefined ? "document" : "instance";
  const implementation = resolveComponent(sdcpn, reference, index?.subnetsById);
  if (!implementation) {
    return { ...unbound, chosenBy, reason: "missing", reference };
  }
  if (isInterface(implementation)) {
    return { ...unbound, chosenBy, reason: "is-interface", implementation };
  }
  const implementsIt = index?.implementsInterface ?? implementsInterface;
  if (!implementsIt(implementation, declared.id)) {
    return { ...unbound, chosenBy, reason: "not-implementing", implementation };
  }
  return { kind: "bound", interface: declared, implementation, chosenBy };
};

/**
 * One sentence on why `binding` runs nothing. `subject` opens it: the name of
 * the instance, or whatever else holds the binding. For an implementation
 * that cannot run, the sentence says what names it: the subject or the
 * document's default.
 */
export const describeUnboundInstance = (
  binding: Extract<ImplementationBinding, { kind: "unbound" }>,
  subject: string,
): string => {
  if (binding.reason === "no-binding") {
    return `${subject} is an instance of the interface ${binding.interface.name} with no implementation: choose one on the instance or set the document's default.`;
  }
  const namer =
    binding.chosenBy === "instance"
      ? subject
      : `${subject} chooses no implementation, and the document's default for ${binding.interface.name}`;
  switch (binding.reason) {
    case "missing":
      return `${namer} names an implementation that does not exist.`;
    case "is-interface":
      return `${namer} names ${binding.implementation.name} as its implementation, which is an interface itself.`;
    case "not-implementing":
      return `${namer} names ${binding.implementation.name} as its implementation, which does not implement ${binding.interface.name}.`;
  }
};

/** The id `runningIdsByKey` holds for each item of `declared`, under the item's `key`. */
const matchIds = <Item extends { id: ID }>(
  declared: readonly Item[],
  runningIdsByKey: ReadonlyMap<string, ID>,
  key: (item: Item) => string,
): Map<ID, ID> =>
  new Map(
    declared.flatMap((item) => {
      const match = runningIdsByKey.get(key(item));
      return match === undefined ? [] : [[item.id, match] as const];
    }),
  );

/**
 * The implementation's port for each of the interface's, matched by name. An
 * interface port without a match is absent, which `check-interfaces.ts`
 * reports. `implementation` is the implementation's index: a caller that
 * matches it to many interfaces hands each call the same one.
 */
export const mapInterfacePorts = (
  iface: Pick<Subnet, "places">,
  implementation: Pick<SubnetIndex, "portIdsByName">,
): Map<ID, ID> =>
  matchIds(
    iface.places.filter(({ isPort }) => isPort),
    implementation.portIdsByName(),
    ({ name }) => name,
  );

/** The implementation's parameter for each of the interface's, matched by variable name. */
export const mapInterfaceParameters = (
  iface: Pick<Subnet, "parameters">,
  implementation: Pick<SubnetIndex, "parameterIdsByVariableName">,
): Map<ID, ID> =>
  matchIds(
    iface.parameters,
    implementation.parameterIdsByVariableName(),
    ({ variableName }) => variableName,
  );

/**
 * The subnet an instance declares, the one that runs for it, and the running
 * subnet's ids for the declared one's ports and parameters: identities for a
 * component, the name-matched ones of the implementation for an interface.
 * An id the implementation has no match for maps to itself.
 */
export type RunningSubnet = {
  declared: Subnet;
  running: Subnet;
  portId: (declaredPortId: ID) => ID;
  parameterId: (declaredParameterId: ID) => ID;
};

/**
 * What runs for `binding`. `index` is `indexDocument(sdcpn)`, which saves a
 * read of the implementation's ports and parameters for each interface and
 * instance it runs for.
 */
export const runningSubnet = (
  binding: Exclude<ImplementationBinding, { kind: "unbound" }>,
  index?: Pick<DocumentIndex, "subnetIndex">,
): RunningSubnet => {
  if (binding.kind === "component") {
    const identity = (id: ID): ID => id;
    return {
      declared: binding.subnet,
      running: binding.subnet,
      portId: identity,
      parameterId: identity,
    };
  }
  const implementation = (index?.subnetIndex ?? indexSubnet)(
    binding.implementation,
  );
  const ports = mapInterfacePorts(binding.interface, implementation);
  const parameters = mapInterfaceParameters(binding.interface, implementation);
  return {
    declared: binding.interface,
    running: binding.implementation,
    portId: (id) => ports.get(id) ?? id,
    parameterId: (id) => parameters.get(id) ?? id,
  };
};

/**
 * A string two instances share exactly when they are bound alike: they name
 * one subnet and choose one implementation, or none.
 */
export const bindingKey = (
  instance: Pick<ComponentInstance, "subnetId" | "implementation">,
): string =>
  JSON.stringify([instance.subnetId, instance.implementation?.id ?? null]);

/** A port, and the subnet it is in. */
type PortOfSubnet = { subnet: Subnet; place: Place };

/**
 * The place that runs for each port of `instance`, and the subnet it is in:
 * the declared port itself for a component, and for an instance of an
 * interface the bound implementation's port of the same name. Falls back to
 * the declared port while nothing is bound or the implementation lacks the
 * port.
 *
 * The binding is resolved here, once: a caller with many ports to ask about,
 * of this instance or of others with its `bindingKey`, keeps the function it
 * is given. `index` is `indexDocument(sdcpn)`.
 */
export const resolveRunningPorts = (
  sdcpn: Pick<SDCPN, "subnets" | "implementations">,
  instance: Pick<ComponentInstance, "subnetId" | "implementation">,
  index?: DocumentIndex,
): ((declared: PortOfSubnet) => PortOfSubnet) => {
  const binding = resolveImplementation(sdcpn, instance, index);
  if (binding?.kind !== "bound") {
    return (declared) => declared;
  }
  const { running, portId } = runningSubnet(binding);
  const placesById = indexById(running.places);
  return (declared) => {
    const place = placesById.get(portId(declared.place.id));
    return place ? { subnet: running, place } : declared;
  };
};
