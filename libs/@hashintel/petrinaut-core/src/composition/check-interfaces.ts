/**
 * The checks on interfaces and their implementations: an interface has no
 * body and implements no interface, an implementation has every port and
 * parameter its interfaces declare with the same token type and a compatible
 * direction, the document has one default per interface, every instance
 * names a component its library has, every instance of an interface has an
 * implementation to run, and no component runs inside itself.
 */

import { colorsStructurallyEqual } from "./fusions";
import {
  bindingKey,
  bindsWithinDocument,
  componentKey,
  defaultImplementation,
  describeUnboundInstance,
  hasBody,
  implementsInterface,
  indexDocument,
  indexComponent,
  isInterface,
  mapInterfaceParameters,
  mapInterfacePorts,
  once,
  resolveComponent,
  resolveImplementation,
  type DocumentIndex,
  type ImplementationBinding,
  type ComponentIndex,
} from "./interfaces";
import { describePortDirection, effectivePortDirections } from "./ports";

import type {
  Component,
  ComponentReference,
  ID,
  PortDirection,
  SDCPN,
} from "../types/sdcpn";
import type { ResolvedLibraries } from "./libraries";

export type InterfaceProblemCode =
  | "interface-has-body"
  | "interface-implements"
  | "unknown-interface"
  | "missing-port"
  | "port-type-mismatch"
  | "port-direction-mismatch"
  | "missing-parameter"
  | "parameter-type-mismatch"
  | "duplicate-default"
  | "missing-component"
  | "unbound-instance"
  | "component-cycle";

export type InterfaceProblem = {
  kind: "interface";
  /**
   * The component the problem is on: the interface or the implementation, or
   * for an instance the net that holds it, `null` for the root net. `null`
   * too for a default of the document whose interface does not exist.
   */
  componentId: ID | null;
  /** The instance, for a problem with an instance's component or binding. */
  instanceId?: ID;
  code: InterfaceProblemCode;
  severity: "error" | "warning";
  message: string;
};

/**
 * A function that adds a problem to `problems`, on a component or on an
 * instance and the net that holds it: an error unless it is told otherwise.
 */
const reporter =
  (
    problems: InterfaceProblem[],
    on: Pick<InterfaceProblem, "componentId" | "instanceId">,
  ) =>
  (
    code: InterfaceProblemCode,
    message: string,
    severity: InterfaceProblem["severity"] = "error",
  ): void => {
    problems.push({ kind: "interface", ...on, code, severity, message });
  };

/**
 * What the check reads of an implementation: its index, and the directions
 * of its ports, read off its arcs once, when first asked for.
 */
type ImplementationIndex = ComponentIndex & {
  directions: () => ReadonlyMap<ID, PortDirection>;
};

/** A caller that holds the implementation's index already hands it over as `index`. */
export const indexImplementation = (
  implementation: Component,
  index: ComponentIndex = indexComponent(implementation),
): ImplementationIndex => ({
  ...index,
  directions: once(() => effectivePortDirections(implementation)),
});

/**
 * Where `implementation` falls short of what `iface` declares. A caller that
 * checks one component in many pairs hands each call that component's index, so its
 * lists and arcs are read once.
 */
export const checkImplementation = (
  implementation: Component,
  iface: Component,
  index: ImplementationIndex = indexImplementation(implementation),
  interfaceIndex: ComponentIndex = indexComponent(iface),
): InterfaceProblem[] => {
  const problems: InterfaceProblem[] = [];
  const report = reporter(problems, { componentId: implementation.id });

  // The pairs the flattener wires, so the check and the run cannot differ.
  const ports = mapInterfacePorts(interfaceIndex, index);
  const parameters = mapInterfaceParameters(iface, index);

  for (const port of interfaceIndex.ports()) {
    const matchId = ports.get(port.id);
    const match =
      matchId === undefined ? undefined : index.places().get(matchId);
    if (!match) {
      report(
        "missing-port",
        `${implementation.name} has no port named ${port.name}, which ${iface.name} declares.`,
      );
      continue;
    }
    const interfaceColor = port.colorId
      ? interfaceIndex.types().get(port.colorId)
      : undefined;
    const implementationColor = match.colorId
      ? index.types().get(match.colorId)
      : undefined;
    if (!colorsStructurallyEqual(interfaceColor, implementationColor)) {
      report(
        "port-type-mismatch",
        `Port ${port.name} of ${implementation.name} holds a different token type from the one ${iface.name} declares.`,
      );
    }
    // A port the interface declares two-way, or not at all, accepts any use.
    if (port.portDirection !== undefined && port.portDirection !== "inout") {
      const effective =
        match.portDirection ?? index.directions().get(match.id) ?? "inout";
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
    const matchId = parameters.get(parameter.id);
    const match =
      matchId === undefined ? undefined : index.parameters().get(matchId);
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
 * Numbers the groups of components that run each other: two share a number when
 * each is reached from the other along `runs`, the components each one's
 * instances run. Tarjan's algorithm, which visits every component once.
 */
const cycleGroups = (runs: ReadonlyMap<ID, readonly ID[]>): Map<ID, number> => {
  const visited = new Map<ID, number>();
  const groups = new Map<ID, number>();
  const stack: ID[] = [];
  /** The earliest visit among the components `id` reaches that are in no group yet. */
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

/** The component that runs for `binding`, without the id maps `runningComponent` builds. */
const runningOf = (
  binding: Exclude<ImplementationBinding, { kind: "unbound" }>,
): Component =>
  binding.kind === "component" ? binding.component : binding.implementation;

/**
 * What `component` declares: an interface has no body and implements nothing,
 * and what a component implements is an interface it lives up to.
 */
const checkDeclarations = (
  component: Component,
  index: DocumentIndex,
): InterfaceProblem[] => {
  const problems: InterfaceProblem[] = [];
  const report = reporter(problems, { componentId: component.id });
  // A list may name an interface twice: its shortfall is reported once.
  const implemented = new Set(component.implements);
  if (isInterface(component)) {
    if (hasBody(component)) {
      report(
        "interface-has-body",
        `${component.name} is an interface but holds transitions or instances; an interface is ports and parameters alone.`,
      );
    }
    if (implemented.size > 0) {
      report(
        "interface-implements",
        `${component.name} is an interface but says it implements one; an interface cannot implement an interface.`,
      );
    }
    // With no body to run, it is not held to what it says it implements.
    return problems;
  }
  const own = indexImplementation(component, index.componentIndex(component));
  for (const interfaceId of implemented) {
    const iface = index.componentsById.get(interfaceId);
    if (iface && isInterface(iface)) {
      problems.push(
        ...checkImplementation(
          component,
          iface,
          own,
          index.componentIndex(iface),
        ),
      );
    } else {
      report(
        "unknown-interface",
        iface
          ? `${component.name} implements ${iface.name}, which is not an interface.`
          : `${component.name} implements an interface that does not exist.`,
      );
    }
  }
  return problems;
};

/** The document's defaults: an interface has one entry at most. */
const checkDefaults = (
  sdcpn: SDCPN,
  componentsById: ReadonlyMap<ID, Component>,
  libraries: ResolvedLibraries | undefined,
): InterfaceProblem[] => {
  // In the order of the first entry for each interface, where it is reported.
  const entries = new Map<
    string,
    { reference: ComponentReference; count: number }
  >();
  for (const { interface: reference } of sdcpn.implementations ?? []) {
    const key = componentKey(reference);
    const counted = entries.get(key);
    if (counted) {
      counted.count += 1;
    } else {
      entries.set(key, { reference, count: 1 });
    }
  }
  const problems: InterfaceProblem[] = [];
  for (const { reference, count } of entries.values()) {
    if (count > 1) {
      const iface = resolveComponent(
        sdcpn,
        reference,
        libraries,
        componentsById,
      );
      // Only a component of the document can be opened to show the problem.
      const onDocument = iface !== undefined && reference.from === undefined;
      reporter(problems, { componentId: onDocument ? reference.id : null })(
        "duplicate-default",
        `The document names ${count} default implementations for ${iface?.name ?? "an interface that does not exist"}: an interface has one, and the first applies.`,
      );
    }
  }
  return problems;
};

/**
 * What each instance is bound to: its library has the component it names, an
 * instance of an interface has an implementation to run, and no component
 * runs inside itself.
 */
const checkBindings = (
  sdcpn: SDCPN,
  index: DocumentIndex,
  libraries: ResolvedLibraries | undefined,
): InterfaceProblem[] => {
  const problems: InterfaceProblem[] = [];
  const held = [
    { netId: null, instances: sdcpn.componentInstances },
    ...(sdcpn.components ?? []).map((component) => ({
      netId: component.id,
      instances: component.componentInstances,
    })),
  ].flatMap(({ netId, instances = [] }) =>
    instances.flatMap((instance) => {
      const binding = resolveImplementation(sdcpn, instance, libraries, index);
      if (binding !== null) {
        return [{ netId, instance, binding }];
      }
      // An instance whose component does not resolve has no binding to
      // check. A library that resolved does not have the component. One that
      // failed is one problem already, of the imports, and one that is still
      // resolving is none.
      const { from, id } = instance.component;
      if (from !== undefined && libraries?.has(from)) {
        reporter(problems, { componentId: netId, instanceId: instance.id })(
          "missing-component",
          `${instance.name} names the component \`${id}\`, which the library \`${from}\` does not have.`,
        );
      }
      return [];
    }),
  );

  // A component of an import holds no instance, so no loop runs through one:
  // only the document's own components are joined.
  const inDocument = (component: Component) =>
    index.componentsById.get(component.id) === component;
  const runs = new Map<ID, ID[]>();
  for (const { netId, binding } of held) {
    if (
      netId !== null &&
      binding.kind !== "unbound" &&
      inDocument(runningOf(binding))
    ) {
      const ran = runs.get(netId) ?? [];
      ran.push(runningOf(binding).id);
      runs.set(netId, ran);
    }
  }
  const groups = cycleGroups(runs);

  // What a binding across a library falls short of, checked once for the
  // instances bound alike.
  const shortfallsByBinding = new Map<string, InterfaceProblem[]>();

  for (const { netId, instance, binding } of held) {
    const report = reporter(problems, {
      componentId: netId,
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
    // A component that implements an interface of its document is held to it
    // where it says so. Across a library the binding is all that says it.
    const reference =
      instance.implementation ??
      defaultImplementation(sdcpn, instance.component, index.defaults);
    if (
      binding.kind === "bound" &&
      reference &&
      !bindsWithinDocument(instance.component, reference)
    ) {
      const key = bindingKey(instance);
      let shortfalls = shortfallsByBinding.get(key);
      if (!shortfalls) {
        shortfalls = checkImplementation(running, binding.interface);
        shortfallsByBinding.set(key, shortfalls);
      }
      for (const shortfall of shortfalls) {
        report(shortfall.code, shortfall.message, shortfall.severity);
      }
    }
    // An instance closes a loop when what it runs leads back to its holder.
    if (
      netId !== null &&
      inDocument(running) &&
      groups.get(netId) === groups.get(running.id)
    ) {
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

/**
 * The problems with the document's interfaces, their implementations and the
 * instances bound to them. `libraries` are the ones the document's imports
 * resolved to: an instance of a component of any other import is left alone.
 */
export const checkInterfaces = (
  sdcpn: SDCPN,
  libraries?: ResolvedLibraries,
): InterfaceProblem[] => {
  const index = indexDocument(sdcpn);
  return [
    ...(sdcpn.components ?? []).flatMap((component) =>
      checkDeclarations(component, index),
    ),
    ...checkDefaults(sdcpn, index.componentsById, libraries),
    ...checkBindings(sdcpn, index, libraries),
  ];
};

/**
 * The components that can run for the interface `iface` names, each with the
 * reference a binding names it by: the document's components that say they
 * implement it, then the components with a body of every library that have
 * its ports and parameters. For an interface of an import, a component of the
 * document is listed on its ports and parameters too, since it cannot say
 * what it implements there.
 */
export const implementationsOf = (
  sdcpn: Pick<SDCPN, "components">,
  iface: ComponentReference,
  libraries?: ResolvedLibraries,
): { reference: ComponentReference; component: Component }[] => {
  const declared = resolveComponent(sdcpn, iface, libraries);
  if (!declared) {
    return [];
  }
  const conforms = (component: Component) =>
    !checkImplementation(component, declared).some(
      ({ severity }) => severity === "error",
    );
  const candidates: { reference: ComponentReference; component: Component }[] =
    [
      ...(sdcpn.components ?? []).map((component) => ({
        reference: { id: component.id },
        component,
      })),
      ...[...(libraries?.values() ?? [])].flatMap((library) =>
        library.components.map((component) => ({
          reference: { from: library.id, id: component.id },
          component,
        })),
      ),
    ];
  return candidates.filter(
    ({ reference, component }) =>
      !isInterface(component) &&
      (bindsWithinDocument(iface, reference)
        ? implementsInterface(component, iface.id)
        : conforms(component)),
  );
};
