/**
 * The checks on interfaces and their implementations: an interface has no
 * body, an implementation has every port and parameter its interfaces
 * declare with the same token type and a compatible direction, every
 * instance of an interface has an implementation to run, and no component
 * runs inside itself.
 */

import { colorsStructurallyEqual } from "./fusions";
import {
  describeUnboundInstance,
  hasBody,
  indexSubnets,
  isInterface,
  mapInterfaceParameters,
  mapInterfacePorts,
  resolveImplementation,
  type ImplementationBinding,
} from "./interfaces";
import { describePortDirection, effectivePortDirection } from "./ports";

import type { ID, SDCPN, Subnet } from "../types/sdcpn";

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

/**
 * A function that adds a problem to `problems`, on a subnet or on an instance
 * and the net that holds it: an error unless it is told otherwise.
 */
const reporter =
  (
    problems: InterfaceProblem[],
    on: Pick<InterfaceProblem, "subnetId" | "instanceId">,
  ) =>
  (
    code: InterfaceProblemCode,
    message: string,
    severity: InterfaceProblem["severity"] = "error",
  ): void => {
    problems.push({ kind: "interface", ...on, code, severity, message });
  };

/** Where `implementation` falls short of what `iface` declares. */
export const checkImplementation = (
  implementation: Subnet,
  iface: Subnet,
): InterfaceProblem[] => {
  const problems: InterfaceProblem[] = [];
  const report = reporter(problems, { subnetId: implementation.id });

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
        `Port ${port.name} of ${implementation.name} holds a different token type from the one ${iface.name} declares.`,
      );
    }
    // A port the interface declares two-way, or not at all, accepts any use.
    if (port.portDirection !== undefined && port.portDirection !== "inout") {
      const effective = effectivePortDirection(implementation, match);
      if (effective !== port.portDirection) {
        report(
          "port-direction-mismatch",
          `Port ${port.name} of ${implementation.name} is ${describePortDirection(effective)}, but ${iface.name} declares it ${describePortDirection(port.portDirection)}.`,
          "warning",
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
        `${implementation.name} has no parameter ${parameter.variableName}, which ${iface.name} declares.`,
      );
    } else if (match.type !== parameter.type) {
      report(
        "parameter-type-mismatch",
        `Parameter ${parameter.variableName} of ${implementation.name} is ${match.type}, but ${iface.name} declares it ${parameter.type}.`,
      );
    }
  }
  return problems;
};

/**
 * Numbers the groups of subnets that run each other: two share a number when
 * each is reached from the other along `runs`, the subnets each one's
 * instances run. Tarjan's algorithm, which visits every subnet once.
 */
const cycleGroups = (runs: ReadonlyMap<ID, readonly ID[]>): Map<ID, number> => {
  const visited = new Map<ID, number>();
  const groups = new Map<ID, number>();
  const stack: ID[] = [];
  /** The earliest visit among the subnets `id` reaches that are in no group yet. */
  const visit = (id: ID): number => {
    const order = visited.size;
    visited.set(id, order);
    stack.push(id);
    let earliest = order;
    for (const next of runs.get(id) ?? []) {
      const seen = visited.get(next);
      if (seen === undefined) {
        earliest = Math.min(earliest, visit(next));
      } else if (!groups.has(next)) {
        earliest = Math.min(earliest, seen);
      }
    }
    if (earliest === order) {
      // Nothing `id` reaches leads back above it: the stack from `id` up is
      // one group.
      for (const member of stack.splice(stack.lastIndexOf(id))) {
        groups.set(member, order);
      }
    }
    return earliest;
  };
  for (const id of runs.keys()) {
    if (!visited.has(id)) {
      visit(id);
    }
  }
  return groups;
};

/** The subnet that runs for `binding`, without the id maps `runningSubnet` builds. */
const runningOf = (
  binding: Exclude<ImplementationBinding, { kind: "unbound" }>,
): Subnet =>
  binding.kind === "component" ? binding.subnet : binding.implementation;

/**
 * What `subnet` declares: an interface has no body, and what a subnet
 * implements is an interface it lives up to.
 */
const checkDeclarations = (
  subnet: Subnet,
  subnetsById: ReadonlyMap<ID, Subnet>,
): InterfaceProblem[] => {
  const problems: InterfaceProblem[] = [];
  const report = reporter(problems, { subnetId: subnet.id });
  if (isInterface(subnet) && hasBody(subnet)) {
    report(
      "interface-has-body",
      `${subnet.name} is an interface but holds transitions or instances; an interface is ports and parameters alone.`,
    );
  }
  // A list may name an interface twice: its shortfall is reported once.
  for (const interfaceId of new Set(subnet.implements)) {
    const iface = subnetsById.get(interfaceId);
    if (iface && isInterface(iface)) {
      problems.push(...checkImplementation(subnet, iface));
    } else {
      report(
        "unknown-interface",
        iface
          ? `${subnet.name} implements ${iface.name}, which is not an interface.`
          : `${subnet.name} implements an interface that does not exist.`,
      );
    }
  }
  return problems;
};

/**
 * What each instance is bound to: an instance of an interface has an
 * implementation to run, and no component runs inside itself.
 */
const checkBindings = (
  sdcpn: SDCPN,
  subnetsById: ReadonlyMap<ID, Subnet>,
): InterfaceProblem[] => {
  // An instance of a subnet that does not exist is for other checks to report.
  const held = [
    { netId: null, instances: sdcpn.componentInstances },
    ...(sdcpn.subnets ?? []).map((subnet) => ({
      netId: subnet.id,
      instances: subnet.componentInstances,
    })),
  ].flatMap(({ netId, instances = [] }) =>
    instances.flatMap((instance) => {
      const binding = resolveImplementation(sdcpn, instance, subnetsById);
      return binding === null ? [] : [{ netId, instance, binding }];
    }),
  );

  const runs = new Map<ID, ID[]>();
  for (const { netId, binding } of held) {
    if (netId !== null && binding.kind !== "unbound") {
      const ran = runs.get(netId) ?? [];
      ran.push(runningOf(binding).id);
      runs.set(netId, ran);
    }
  }
  const groups = cycleGroups(runs);

  const problems: InterfaceProblem[] = [];
  for (const { netId, instance, binding } of held) {
    const report = reporter(problems, {
      subnetId: netId,
      instanceId: instance.id,
    });
    if (binding.kind === "unbound") {
      report(
        "unbound-instance",
        describeUnboundInstance(binding, instance.name),
      );
      continue;
    }
    const running = runningOf(binding);
    // An instance closes a loop when what it runs leads back to its holder.
    if (netId !== null && groups.get(netId) === groups.get(running.id)) {
      report(
        "component-cycle",
        running.id === netId
          ? `${instance.name} runs ${running.name} inside itself: a component cannot contain itself.`
          : `${instance.name} runs ${running.name}, which holds this component in turn: a component cannot contain itself.`,
      );
    }
  }
  return problems;
};

/** The problems with the document's interfaces, their implementations and the instances bound to them. */
export const checkInterfaces = (sdcpn: SDCPN): InterfaceProblem[] => {
  const subnetsById = indexSubnets(sdcpn);
  return [
    ...(sdcpn.subnets ?? []).flatMap((subnet) =>
      checkDeclarations(subnet, subnetsById),
    ),
    ...checkBindings(sdcpn, subnetsById),
  ];
};
