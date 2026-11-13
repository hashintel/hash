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

/** The subnets that declare they implement `interfaceId`. */
export const implementationsOf = (
  sdcpn: Pick<SDCPN, "subnets">,
  interfaceId: ID,
): Subnet[] =>
  (sdcpn.subnets ?? []).filter((subnet) =>
    implementsInterface(subnet, interfaceId),
  );

export type ImplementationBinding =
  | { kind: "component"; subnet: Subnet }
  | {
      kind: "bound";
      interface: Subnet;
      implementation: Subnet;
      /** Whether the instance chose the implementation or the document's default applied. */
      chosenBy: "instance" | "document";
    }
  | ({ kind: "unbound"; interface: Subnet } & (
      | { reason: "no-binding" }
      /** The binding names a subnet that does not exist. */
      | { reason: "missing"; implementationId: ID }
      /** The binding names a subnet that cannot stand behind the interface. */
      | { reason: "is-interface" | "not-implementing"; implementation: Subnet }
    ));

/** Why an instance of an interface has nothing to run. */
export type UnboundReason = Extract<
  ImplementationBinding,
  { kind: "unbound" }
>["reason"];

/**
 * The subnet that runs for `instance`: its own subnet when that is a
 * component; for an interface, the implementation the instance chose, else
 * the document's default. `null` when the instance's subnet does not exist.
 */
export const resolveImplementation = (
  sdcpn: Pick<SDCPN, "subnets" | "implementations">,
  instance: Pick<ComponentInstance, "subnetId" | "implementation">,
): ImplementationBinding | null => {
  const subnets = sdcpn.subnets ?? [];
  const declared = subnets.find(({ id }) => id === instance.subnetId);
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
  const implementation = subnets.find(({ id }) => id === implementationId);
  if (!implementation) {
    return { ...unbound, reason: "missing", implementationId };
  }
  if (isInterface(implementation)) {
    return { ...unbound, reason: "is-interface", implementation };
  }
  if (!implementsInterface(implementation, declared.id)) {
    return { ...unbound, reason: "not-implementing", implementation };
  }
  return {
    kind: "bound",
    interface: declared,
    implementation,
    chosenBy: instance.implementation === undefined ? "document" : "instance",
  };
};

/** One sentence on why `binding` runs nothing, naming the instance. */
export const describeUnboundInstance = (
  binding: Extract<ImplementationBinding, { kind: "unbound" }>,
  instanceName: string,
): string => {
  switch (binding.reason) {
    case "no-binding":
      return `${instanceName} is an instance of the interface ${binding.interface.name} with no implementation: choose one on the instance or set the document's default.`;
    case "missing":
      return `${instanceName} names an implementation that does not exist.`;
    case "is-interface":
      return `${instanceName} names ${binding.implementation.name} as its implementation, which is an interface itself.`;
    case "not-implementing":
      return `${instanceName} names ${binding.implementation.name} as its implementation, which does not implement ${binding.interface.name}.`;
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
  const runningId = mapInterfacePorts(
    binding.interface,
    binding.implementation,
  ).get(declared.place.id);
  const place = binding.implementation.places.find(
    ({ id }) => id === runningId,
  );
  return place ? { subnet: binding.implementation, place } : declared;
};
