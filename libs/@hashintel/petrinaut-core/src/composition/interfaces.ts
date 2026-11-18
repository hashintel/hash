/**
 * Components and interfaces. A component is a subnet of the document or a
 * component of one of its imports, and every reader gets at one through
 * `resolveComponent`. A subnet flagged `interface` is a signature, ports,
 * types and parameters with no body, that instances point at like any
 * component. The subnet that runs for such an instance is the implementation
 * bound to it, by the instance itself or by the document's defaults.
 * `implements` on a subnet says which interfaces it can stand behind, and
 * `check-interfaces.ts` holds it to their ports and parameters.
 */

import type {
  Color,
  ComponentInstance,
  ComponentReference,
  ID,
  Parameter,
  Place,
  SDCPN,
  Subnet,
} from "../types/sdcpn";
import type { ResolvedLibraries } from "./libraries";

/** The component an instance instantiates: one of an import, else a subnet of the document. */
export const componentOf = (
  instance: Pick<ComponentInstance, "subnetId" | "component">,
): ComponentReference =>
  // An instance has one of the two. With neither, the reference names nothing.
  instance.component ?? { id: instance.subnetId ?? "" };

/** Whether two references name the same component: the same id, from the same place. */
export const sameComponent = (
  left: ComponentReference,
  right: ComponentReference,
): boolean => left.id === right.id && left.from === right.from;

/** A string that two references share exactly when they name the same component. */
export const componentKey = ({ from, id }: ComponentReference): string =>
  from === undefined ? id : JSON.stringify([from, id]);

/** How a message ends that says `reference` names no component it can read. */
export const describeMissingComponent = ({
  from,
  id,
}: ComponentReference): string =>
  from === undefined
    ? `subnet ID \`${id}\` which does not exist`
    : `component \`${id}\` of the import \`${from}\`, which is not available`;

export const isInterface = (subnet: Pick<Subnet, "interface">): boolean =>
  subnet.interface === true;

/** Whether a subnet holds what an interface may not: a transition or an instance. */
export const hasBody = (
  subnet: Pick<Subnet, "transitions" | "componentInstances">,
): boolean =>
  subnet.transitions.length > 0 || (subnet.componentInstances?.length ?? 0) > 0;

/**
 * The component `reference` names: a subnet of the document, or a component
 * of one of its imports, as a subnet too. `undefined` when there is none, and
 * for a component of an import that is not among `libraries`: one that is
 * still resolving, or that failed. `subnetsById` is `indexSubnets(sdcpn)`,
 * which saves a search of the document's list.
 */
export const resolveComponent = (
  sdcpn: Pick<SDCPN, "subnets">,
  reference: ComponentReference,
  libraries?: ResolvedLibraries,
  subnetsById?: ReadonlyMap<ID, Subnet>,
): Subnet | undefined => {
  if (reference.from !== undefined) {
    return libraries
      ?.get(reference.from)
      ?.components.find(({ id }) => id === reference.id);
  }
  return subnetsById
    ? subnetsById.get(reference.id)
    : sdcpn.subnets?.find(({ id }) => id === reference.id);
};

/**
 * The component the document runs for an interface whose instance chooses
 * none. Of two entries for one interface the first applies, and
 * `check-interfaces.ts` reports the pair. `defaults` is
 * `indexDocument(sdcpn).defaults`, which saves a search of the list.
 */
export const defaultImplementation = (
  sdcpn: Pick<SDCPN, "implementations">,
  iface: ComponentReference,
  defaults?: DocumentIndex["defaults"],
): ComponentReference | undefined =>
  defaults
    ? defaults.get(componentKey(iface))
    : sdcpn.implementations?.find((entry) =>
        sameComponent(entry.interface, iface),
      )?.component;

export const implementsInterface = (
  subnet: Pick<Subnet, "implements">,
  interfaceId: ID,
): boolean => subnet.implements?.includes(interfaceId) ?? false;

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
 * What the checks and the flattener read of a subnet that is an interface or
 * stands behind one: each of its lists by id, its ports, and what an
 * interface's ports and parameters are matched by. Each is read once, when
 * first asked for.
 */
export type SubnetIndex = {
  places: () => ReadonlyMap<ID, Place>;
  types: () => ReadonlyMap<ID, Color>;
  parameters: () => ReadonlyMap<ID, Parameter>;
  ports: () => readonly Place[];
  /** The id of its port of each name: of two ports with one name, the last. */
  portIdsByName: () => ReadonlyMap<string, ID>;
  /** The id of its parameter of each variable name: of two with one, the last. */
  parameterIdsByVariableName: () => ReadonlyMap<string, ID>;
};

export const indexSubnet = (subnet: Subnet): SubnetIndex => {
  const ports = once(() => subnet.places.filter(({ isPort }) => isPort));
  return {
    places: once(() => indexById(subnet.places)),
    types: once(() => indexById(subnet.types)),
    parameters: once(() => indexById(subnet.parameters)),
    ports,
    portIdsByName: once(
      () => new Map(ports().map(({ name, id }) => [name, id])),
    ),
    parameterIdsByVariableName: once(
      () =>
        new Map(
          subnet.parameters.map(({ variableName, id }) => [variableName, id]),
        ),
    ),
  };
};

/**
 * The document's subnets by id and its default implementation by the
 * `componentKey` of each interface, for a caller that resolves many
 * instances. Of two defaults for one interface the first is kept, as a
 * search of the list finds it.
 */
export type DocumentIndex = {
  subnetsById: ReadonlyMap<ID, Subnet>;
  defaults: ReadonlyMap<string, ComponentReference>;
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
   * however many subnets it is matched with and instances it runs for. A
   * subnet the document does not hold under its id is read for the call.
   */
  subnetIndex: (subnet: Subnet) => SubnetIndex;
};

export const indexDocument = (
  sdcpn: Pick<SDCPN, "subnets" | "implementations">,
): DocumentIndex => {
  const defaults = new Map<string, ComponentReference>();
  for (const entry of sdcpn.implementations ?? []) {
    const key = componentKey(entry.interface);
    if (!defaults.has(key)) {
      defaults.set(key, entry.component);
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

/** What names the component an instance instantiates and the one it chose to run. */
export type InstanceBinding = Pick<
  ComponentInstance,
  "subnetId" | "component" | "implementation"
>;

/**
 * Whether a binding joins two components of the document. A subnet says what
 * it implements by the ids of interfaces of its own document, so only such a
 * binding can be held to that list. Across a library nothing can say it: the
 * binding stands, and the checks hold the component to the interface's ports
 * and parameters where it is bound.
 */
export const bindsWithinDocument = (
  iface: ComponentReference,
  implementation: ComponentReference,
): boolean => iface.from === undefined && implementation.from === undefined;

/**
 * The subnet that runs where `iface` is named: the component itself when it
 * has a body; for an interface, the implementation `chosen` names, else the
 * document's default. `null` when `iface` does not resolve.
 */
export const resolveBinding = (
  sdcpn: Pick<SDCPN, "subnets" | "implementations">,
  iface: ComponentReference,
  chosen: ComponentReference | undefined,
  libraries?: ResolvedLibraries,
  index?: DocumentIndex,
): ImplementationBinding | null => {
  const resolve = (reference: ComponentReference) =>
    resolveComponent(sdcpn, reference, libraries, index?.subnetsById);
  const declared = resolve(iface);
  if (!declared) {
    return null;
  }
  if (!isInterface(declared)) {
    return { kind: "component", subnet: declared };
  }
  const unbound = { kind: "unbound", interface: declared } as const;
  const reference =
    chosen ?? defaultImplementation(sdcpn, iface, index?.defaults);
  if (reference === undefined) {
    return { ...unbound, reason: "no-binding" };
  }
  const chosenBy = chosen === undefined ? "document" : "instance";
  const implementation = resolve(reference);
  if (!implementation) {
    return { ...unbound, chosenBy, reason: "missing", reference };
  }
  if (isInterface(implementation)) {
    return { ...unbound, chosenBy, reason: "is-interface", implementation };
  }
  const implementsIt = index?.implementsInterface ?? implementsInterface;
  if (
    bindsWithinDocument(iface, reference) &&
    !implementsIt(implementation, declared.id)
  ) {
    return { ...unbound, chosenBy, reason: "not-implementing", implementation };
  }
  return { kind: "bound", interface: declared, implementation, chosenBy };
};

/**
 * The subnet that runs for `instance`: see `resolveBinding`. `null` when the
 * instance's component does not resolve. `index` is `indexDocument(sdcpn)`,
 * which saves a search of the document's subnets and of its defaults for
 * each instance.
 */
export const resolveImplementation = (
  sdcpn: Pick<SDCPN, "subnets" | "implementations">,
  instance: InstanceBinding,
  libraries?: ResolvedLibraries,
  index?: DocumentIndex,
): ImplementationBinding | null =>
  resolveBinding(
    sdcpn,
    componentOf(instance),
    instance.implementation,
    libraries,
    index,
  );

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
 * reports. Each is given as its index: a caller that matches one with many
 * hands each call the same one.
 */
export const mapInterfacePorts = (
  iface: Pick<SubnetIndex, "ports">,
  implementation: Pick<SubnetIndex, "portIdsByName">,
): Map<ID, ID> =>
  matchIds(iface.ports(), implementation.portIdsByName(), ({ name }) => name);

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
 * read of the interface's places, and of the implementation's places and
 * parameters, for each binding and instance that joins them.
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
  const indexOf = index?.subnetIndex ?? indexSubnet;
  const implementation = indexOf(binding.implementation);
  const ports = mapInterfacePorts(indexOf(binding.interface), implementation);
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
 * one component and choose one implementation, or none.
 */
export const bindingKey = (instance: InstanceBinding): string =>
  JSON.stringify([
    componentKey(componentOf(instance)),
    instance.implementation ? componentKey(instance.implementation) : null,
  ]);

/** A port, and the subnet it is in. */
type PortOfSubnet = { subnet: Subnet; place: Place };

/**
 * A port that runs. `key` is the `componentKey` of the subnet it is in: it
 * tells a component of a library from a subnet of the document with its id.
 */
export type RunningPort = PortOfSubnet & { key: string };

/**
 * The place that runs for each port of `instance`, and the subnet it is in:
 * the declared port itself for a component, and for an instance of an
 * interface the bound implementation's port of the same name. Falls back to
 * the declared port while nothing is bound or the implementation lacks the
 * port.
 *
 * The binding is resolved here, once: a caller with many ports to ask about,
 * of this instance or of others with its `bindingKey`, keeps the function it
 * is given. `index` is `indexDocument(sdcpn)`, which also saves a read of the
 * implementation's places for each binding it runs behind.
 */
export const resolveRunningPorts = (
  sdcpn: Pick<SDCPN, "subnets" | "implementations">,
  instance: InstanceBinding,
  libraries?: ResolvedLibraries,
  index?: DocumentIndex,
): ((declared: PortOfSubnet) => RunningPort) => {
  const own = componentOf(instance);
  const asDeclared = ({ subnet, place }: PortOfSubnet): RunningPort => ({
    key: componentKey(own),
    subnet,
    place,
  });
  const binding = resolveImplementation(sdcpn, instance, libraries, index);
  if (binding?.kind !== "bound") {
    return asDeclared;
  }
  const { running, portId } = runningSubnet(binding, index);
  const placesById = (index?.subnetIndex ?? indexSubnet)(running).places();
  // What a bound instance runs is its own choice, else the document's default.
  const key = componentKey(
    instance.implementation ??
      defaultImplementation(sdcpn, own, index?.defaults) ??
      own,
  );
  return (declared) => {
    const place = placesById.get(portId(declared.place.id));
    return place ? { key, subnet: running, place } : asDeclared(declared);
  };
};
