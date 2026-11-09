/**
 * Interfaces: a subnet flagged `interface` is a signature, ports, types and
 * parameters with no body, that instances point at like any subnet. The
 * subnet that runs for such an instance is the implementation bound to it,
 * by the instance itself or by the document's defaults. `implements` on a
 * subnet says which interfaces it can stand behind, and `check-interfaces.ts`
 * holds it to their ports and parameters.
 */

import type { ComponentInstance, ID, SDCPN, Subnet } from "../types/sdcpn";

export const isInterface = (subnet: Pick<Subnet, "interface">): boolean =>
  subnet.interface === true;

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

/** Why an instance of an interface has nothing to run. */
export type UnboundReason =
  | "no-binding"
  | "missing"
  | "not-implementing"
  | "is-interface";

export type ImplementationBinding =
  | { kind: "component"; subnet: Subnet }
  | {
      kind: "bound";
      interface: Subnet;
      implementation: Subnet;
      /** Whether the instance chose the implementation or the document's default applied. */
      chosenBy: "instance" | "document";
    }
  | {
      kind: "unbound";
      interface: Subnet;
      reason: UnboundReason;
      /** The subnet the binding named, when it named one. */
      implementationId?: ID;
    };

const lookup = (
  record: Record<string, ID> | undefined,
  key: ID,
): ID | undefined =>
  record !== undefined && Object.hasOwn(record, key) ? record[key] : undefined;

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
  const chosenBy =
    instance.implementation === undefined ? "document" : "instance";
  const implementationId =
    instance.implementation ?? lookup(sdcpn.implementations, declared.id);
  if (implementationId === undefined) {
    return { kind: "unbound", interface: declared, reason: "no-binding" };
  }
  const implementation = subnets.find(({ id }) => id === implementationId);
  if (!implementation) {
    return {
      kind: "unbound",
      interface: declared,
      reason: "missing",
      implementationId,
    };
  }
  if (isInterface(implementation)) {
    return {
      kind: "unbound",
      interface: declared,
      reason: "is-interface",
      implementationId,
    };
  }
  if (!implementsInterface(implementation, declared.id)) {
    return {
      kind: "unbound",
      interface: declared,
      reason: "not-implementing",
      implementationId,
    };
  }
  return { kind: "bound", interface: declared, implementation, chosenBy };
};

/** One sentence on why `binding` runs nothing, naming the instance. */
export const describeUnboundInstance = (
  sdcpn: Pick<SDCPN, "subnets">,
  binding: Extract<ImplementationBinding, { kind: "unbound" }>,
  instanceName: string,
): string => {
  const named =
    binding.implementationId === undefined
      ? undefined
      : (sdcpn.subnets ?? []).find(({ id }) => id === binding.implementationId);
  switch (binding.reason) {
    case "no-binding":
      return `${instanceName} is an instance of the interface ${binding.interface.name} with no implementation: choose one on the instance or set the document's default.`;
    case "missing":
      return `${instanceName} names an implementation that does not exist.`;
    case "is-interface":
      return `${instanceName} names ${named?.name ?? "a subnet"} as its implementation, which is an interface itself.`;
    case "not-implementing":
      return `${instanceName} names ${named?.name ?? "a subnet"} as its implementation, which does not implement ${binding.interface.name}.`;
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
