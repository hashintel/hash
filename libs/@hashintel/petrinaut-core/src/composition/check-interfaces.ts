/**
 * The checks on interfaces and their implementations: an interface has no
 * body, an implementation has every port and parameter its interfaces
 * declare with the same token type and a compatible direction, every
 * instance of an interface has an implementation to run, and no component
 * runs inside itself.
 */

import { colorsStructurallyEqual } from "./check-fusions";
import {
  describeUnboundInstance,
  hasBody,
  isInterface,
  mapInterfaceParameters,
  mapInterfacePorts,
  resolveImplementation,
  runningSubnet,
} from "./interfaces";
import { describePortDirection, effectivePortDirection } from "./ports";

import type { ComponentInstance, ID, SDCPN, Subnet } from "../types/sdcpn";

export type InterfaceProblemCode =
  | "interface-has-body"
  | "unknown-interface"
  | "missing-port"
  | "port-type-mismatch"
  | "port-direction-mismatch"
  | "missing-parameter"
  | "parameter-type-mismatch"
  | "unbound-instance"
  | "component-cycle";

export type InterfaceProblem = {
  kind: "interface";
  /**
   * The subnet the problem is on: the interface or the implementation, or
   * for an instance the net that holds it, `null` for the root net.
   */
  subnetId: ID | null;
  /** The instance, for a problem with an instance's binding. */
  instanceId?: ID;
  code: InterfaceProblemCode;
  severity: "error" | "warning";
  message: string;
};

/** Where `implementation` falls short of what `iface` declares. */
export const checkImplementation = (
  implementation: Subnet,
  iface: Subnet,
): InterfaceProblem[] => {
  const problems: InterfaceProblem[] = [];
  const report = (
    code: InterfaceProblemCode,
    severity: InterfaceProblem["severity"],
    message: string,
  ) =>
    problems.push({
      kind: "interface",
      subnetId: implementation.id,
      code,
      severity,
      message,
    });

  // The pairs the flattener wires, so the check and the run cannot differ.
  const ports = mapInterfacePorts(iface, implementation);
  const parameters = mapInterfaceParameters(iface, implementation);

  for (const port of iface.places.filter((place) => place.isPort)) {
    const match = implementation.places.find(
      ({ id }) => id === ports.get(port.id),
    );
    if (!match) {
      report(
        "missing-port",
        "error",
        `${implementation.name} has no port named ${port.name}, which ${iface.name} declares.`,
      );
      continue;
    }
    const interfaceColor = port.colorId
      ? iface.types.find(({ id }) => id === port.colorId)
      : undefined;
    const implementationColor = match.colorId
      ? implementation.types.find(({ id }) => id === match.colorId)
      : undefined;
    if (!colorsStructurallyEqual(interfaceColor, implementationColor)) {
      report(
        "port-type-mismatch",
        "error",
        `Port ${port.name} of ${implementation.name} holds a different token type from the one ${iface.name} declares.`,
      );
    }
    if (port.portDirection !== undefined && port.portDirection !== "inout") {
      const effective = effectivePortDirection(implementation, match);
      if (effective !== port.portDirection) {
        report(
          "port-direction-mismatch",
          "warning",
          `Port ${port.name} of ${implementation.name} is ${describePortDirection(effective)}, but ${iface.name} declares it ${describePortDirection(port.portDirection)}.`,
        );
      }
    }
  }

  for (const parameter of iface.parameters) {
    const match = implementation.parameters.find(
      ({ id }) => id === parameters.get(parameter.id),
    );
    if (!match) {
      report(
        "missing-parameter",
        "error",
        `${implementation.name} has no parameter ${parameter.variableName}, which ${iface.name} declares.`,
      );
    } else if (match.type !== parameter.type) {
      report(
        "parameter-type-mismatch",
        "error",
        `Parameter ${parameter.variableName} of ${implementation.name} is ${match.type}, but ${iface.name} declares it ${parameter.type}.`,
      );
    }
  }
  return problems;
};

/** Whether `subnet` is `targetId`, or runs it through its instances and theirs. */
const runs = (
  sdcpn: SDCPN,
  subnet: Subnet,
  targetId: ID,
  seen = new Set<ID>(),
): boolean => {
  if (subnet.id === targetId) {
    return true;
  }
  if (seen.has(subnet.id)) {
    return false;
  }
  seen.add(subnet.id);
  return (subnet.componentInstances ?? []).some((instance) => {
    const binding = resolveImplementation(sdcpn, instance);
    return (
      binding !== null &&
      binding.kind !== "unbound" &&
      runs(sdcpn, runningSubnet(binding).running, targetId, seen)
    );
  });
};

/** The problems with the document's interfaces, their implementations and the instances bound to them. */
export const checkInterfaces = (sdcpn: SDCPN): InterfaceProblem[] => {
  const problems: InterfaceProblem[] = [];
  const subnets = sdcpn.subnets ?? [];

  for (const subnet of subnets) {
    if (isInterface(subnet) && hasBody(subnet)) {
      problems.push({
        kind: "interface",
        subnetId: subnet.id,
        code: "interface-has-body",
        severity: "error",
        message: `${subnet.name} is an interface but holds transitions or instances; an interface is ports and parameters alone.`,
      });
    }
    for (const interfaceId of subnet.implements ?? []) {
      const iface = subnets.find(({ id }) => id === interfaceId);
      if (!iface || !isInterface(iface)) {
        problems.push({
          kind: "interface",
          subnetId: subnet.id,
          code: "unknown-interface",
          severity: "error",
          message: iface
            ? `${subnet.name} implements ${iface.name}, which is not an interface.`
            : `${subnet.name} implements an interface that does not exist.`,
        });
        continue;
      }
      problems.push(...checkImplementation(subnet, iface));
    }
  }

  const nets: [ID | null, { componentInstances?: ComponentInstance[] }][] = [
    [null, sdcpn],
    ...subnets.map((subnet): [ID, Subnet] => [subnet.id, subnet]),
  ];
  for (const [netId, net] of nets) {
    for (const instance of net.componentInstances ?? []) {
      const binding = resolveImplementation(sdcpn, instance);
      if (binding === null) {
        continue;
      }
      const report = (code: InterfaceProblemCode, message: string) =>
        problems.push({
          kind: "interface",
          subnetId: netId,
          instanceId: instance.id,
          code,
          severity: "error",
          message,
        });
      if (binding.kind === "unbound") {
        report(
          "unbound-instance",
          describeUnboundInstance(binding, instance.name),
        );
        continue;
      }
      const { running } = runningSubnet(binding);
      if (netId !== null && runs(sdcpn, running, netId)) {
        report(
          "component-cycle",
          running.id === netId
            ? `${instance.name} runs ${running.name} inside itself: a component cannot contain itself.`
            : `${instance.name} runs ${running.name}, which holds this component in turn: a component cannot contain itself.`,
        );
      }
    }
  }
  return problems;
};
