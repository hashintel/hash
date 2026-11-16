/**
 * Interfaces: a subnet flagged `interface` is a signature, ports, types and
 * parameters with no body, that instances point at like any subnet. The
 * subnet that runs for such an instance is the implementation bound to it,
 * by the instance itself or by the document's defaults. `implements` on a
 * subnet says which interfaces it can stand behind, and `check-interfaces.ts`
 * holds it to their ports and parameters.
 */

import { getOwn } from "../validation/record-keys";

import type {
  ComponentInstance,
  ID,
  Place,
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

/** The subnet the document runs for an interface whose instance chooses none. */
export const defaultImplementationId = (
  sdcpn: Pick<SDCPN, "implementations">,
  interfaceId: ID,
): ID | undefined => getOwn(sdcpn.implementations, interfaceId);

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
      /** The binding names a subnet that does not exist. */
      | { reason: "missing"; implementationId: ID; chosenBy: ChosenBy }
      /** The binding names a subnet that cannot stand behind the interface. */
      | {
          reason: "is-interface" | "not-implementing";
          implementation: Subnet;
          chosenBy: ChosenBy;
        }
    ));

/** Why an instance of an interface has nothing to run. */
export type UnboundReason = Extract<
  ImplementationBinding,
  { kind: "unbound" }
>["reason"];

/**
 * The document's subnets by id, for a caller that resolves many instances.
 * Of two subnets with one id the first is kept, as a search of the list
 * finds it.
 */
export const indexSubnets = (
  sdcpn: Pick<SDCPN, "subnets">,
): Map<ID, Subnet> => {
  const subnetsById = new Map<ID, Subnet>();
  for (const subnet of sdcpn.subnets ?? []) {
    if (!subnetsById.has(subnet.id)) {
      subnetsById.set(subnet.id, subnet);
    }
  }
  return subnetsById;
};

/**
 * The subnet that runs for `instance`: its own subnet when that is a
 * component; for an interface, the implementation the instance chose, else
 * the document's default. `null` when the instance's subnet does not exist.
 * `subnetsById` is `indexSubnets(sdcpn)`, which saves a search of the list
 * for each instance.
 */
export const resolveImplementation = (
  sdcpn: Pick<SDCPN, "subnets" | "implementations">,
  instance: Pick<ComponentInstance, "subnetId" | "implementation">,
  subnetsById?: ReadonlyMap<ID, Subnet>,
): ImplementationBinding | null => {
  const subnetWithId = (subnetId: ID): Subnet | undefined =>
    subnetsById
      ? subnetsById.get(subnetId)
      : sdcpn.subnets?.find(({ id }) => id === subnetId);
  const declared = subnetWithId(instance.subnetId);
  if (!declared) {
    return null;
  }
  if (!isInterface(declared)) {
    return { kind: "component", subnet: declared };
  }
  const unbound = { kind: "unbound", interface: declared } as const;
  const implementationId =
    instance.implementation ?? defaultImplementationId(sdcpn, declared.id);
  if (implementationId === undefined) {
    return { ...unbound, reason: "no-binding" };
  }
  const chosenBy =
    instance.implementation === undefined ? "document" : "instance";
  const implementation = subnetWithId(implementationId);
  if (!implementation) {
    return { ...unbound, chosenBy, reason: "missing", implementationId };
  }
  if (isInterface(implementation)) {
    return { ...unbound, chosenBy, reason: "is-interface", implementation };
  }
  if (!implementsInterface(implementation, declared.id)) {
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

/**
 * The implementation's port for each of the interface's, matched by name. An
 * interface port without a match is absent, which `check-interfaces.ts`
 * reports.
 */
export const mapInterfacePorts = (
  iface: Pick<Subnet, "places">,
  implementation: Pick<Subnet, "places">,
): Map<ID, ID> => {
  const byName = new Map(
    implementation.places
      .filter((place) => place.isPort)
      .map((place) => [place.name, place.id]),
  );
  const map = new Map<ID, ID>();
  for (const port of iface.places) {
    const target = port.isPort ? byName.get(port.name) : undefined;
    if (target !== undefined) {
      map.set(port.id, target);
    }
  }
  return map;
};

/** The implementation's parameter for each of the interface's, matched by variable name. */
export const mapInterfaceParameters = (
  iface: Pick<Subnet, "parameters">,
  implementation: Pick<Subnet, "parameters">,
): Map<ID, ID> => {
  const byVariable = new Map(
    implementation.parameters.map((parameter) => [
      parameter.variableName,
      parameter.id,
    ]),
  );
  const map = new Map<ID, ID>();
  for (const parameter of iface.parameters) {
    const target = byVariable.get(parameter.variableName);
    if (target !== undefined) {
      map.set(parameter.id, target);
    }
  }
  return map;
};

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

export const runningSubnet = (
  binding: Exclude<ImplementationBinding, { kind: "unbound" }>,
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
  const ports = mapInterfacePorts(binding.interface, binding.implementation);
  const parameters = mapInterfaceParameters(
    binding.interface,
    binding.implementation,
  );
  return {
    declared: binding.interface,
    running: binding.implementation,
    portId: (id) => ports.get(id) ?? id,
    parameterId: (id) => parameters.get(id) ?? id,
  };
};

/**
 * The place that runs for a port of `instance`, and the subnet it is in: the
 * declared port itself for a component, and for an instance of an interface
 * the bound implementation's port of the same name. Falls back to the
 * declared port while nothing is bound or the implementation lacks the port.
 */
export const resolveRunningPort = (
  sdcpn: Pick<SDCPN, "subnets" | "implementations">,
  instance: Pick<ComponentInstance, "subnetId" | "implementation">,
  declared: { subnet: Subnet; place: Place },
): { subnet: Subnet; place: Place } => {
  const binding = resolveImplementation(sdcpn, instance);
  if (binding?.kind !== "bound") {
    return declared;
  }
  const { running, portId } = runningSubnet(binding);
  const runningId = portId(declared.place.id);
  const place = running.places.find(({ id }) => id === runningId);
  return place ? { subnet: running, place } : declared;
};
