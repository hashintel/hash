/**
 * Cycle detection for the net graph: Tarjan's strongly-connected components,
 * run iteratively so deep nets can't blow the call stack.
 *
 * Only places and transitions can take part in a cycle — types, parameters
 * and differential equations are pure declarations — so this works on the
 * {@link NetGraph} rather than the full dependency graph.
 */

import type { NetGraph } from "./notebook-model";

/** A set of nodes that are all reachable from each other. */
export type CycleGroup = {
  /** Stable key derived from the members, safe to use as a React key. */
  key: string;
  /** 1-based number shown to the user, in document order of the first member. */
  label: number;
  memberIds: string[];
};

/**
 * Every cycle in the net, ordered by where its earliest member appears in the
 * document. Nodes not in any cycle are absent.
 */
export function findCycleGroups(graph: NetGraph): CycleGroup[] {
  const targetsByNode = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const existing = targetsByNode.get(edge.from);
    if (existing === undefined) {
      targetsByNode.set(edge.from, [edge.to]);
    } else {
      existing.push(edge.to);
    }
  }

  const documentOrder = new Map(
    graph.nodes.map((node, position) => [node.id, position]),
  );

  const depthIndex = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const onStack = new Set<string>();
  const componentStack: string[] = [];
  const components: string[][] = [];
  let nextIndex = 0;

  const open = (id: string) => {
    depthIndex.set(id, nextIndex);
    lowLink.set(id, nextIndex);
    nextIndex += 1;
    componentStack.push(id);
    onStack.add(id);
  };

  for (const root of graph.nodes) {
    if (depthIndex.has(root.id)) {
      continue;
    }
    open(root.id);
    const callStack: { id: string; nextTarget: number }[] = [
      { id: root.id, nextTarget: 0 },
    ];

    while (callStack.length > 0) {
      const frame = callStack[callStack.length - 1]!;
      const targets = targetsByNode.get(frame.id) ?? [];

      if (frame.nextTarget < targets.length) {
        const target = targets[frame.nextTarget]!;
        frame.nextTarget += 1;

        if (!depthIndex.has(target)) {
          open(target);
          callStack.push({ id: target, nextTarget: 0 });
        } else if (onStack.has(target)) {
          lowLink.set(
            frame.id,
            Math.min(lowLink.get(frame.id)!, depthIndex.get(target)!),
          );
        }
        continue;
      }

      callStack.pop();
      const parent = callStack[callStack.length - 1];
      if (parent !== undefined) {
        lowLink.set(
          parent.id,
          Math.min(lowLink.get(parent.id)!, lowLink.get(frame.id)!),
        );
      }

      if (lowLink.get(frame.id) === depthIndex.get(frame.id)) {
        const members: string[] = [];
        let member: string;
        do {
          member = componentStack.pop()!;
          onStack.delete(member);
          members.push(member);
        } while (member !== frame.id);

        if (members.length > 1) {
          components.push(
            members.sort(
              (left, right) =>
                (documentOrder.get(left) ?? 0) -
                (documentOrder.get(right) ?? 0),
            ),
          );
        }
      }
    }
  }

  return components
    .sort(
      (left, right) =>
        (documentOrder.get(left[0]!) ?? 0) -
        (documentOrder.get(right[0]!) ?? 0),
    )
    .map((memberIds, position) => ({
      key: memberIds.join("+"),
      label: position + 1,
      memberIds,
    }));
}

/** Lookup from node id to the cycle it belongs to, for rows and diagram nodes. */
export function buildCycleMembership(
  groups: CycleGroup[],
): Map<string, CycleGroup> {
  const membership = new Map<string, CycleGroup>();
  for (const group of groups) {
    for (const id of group.memberIds) {
      membership.set(id, group);
    }
  }
  return membership;
}

/**
 * Distinct tints for cycle badges and rings, cycled through by group number.
 * Deliberately avoids the blue/orange/purple used for selection roles.
 */
export const CYCLE_TINTS = ["pink", "green", "yellow"] as const;

export type CycleTint = (typeof CYCLE_TINTS)[number];

export const cycleTint = (group: CycleGroup): CycleTint =>
  CYCLE_TINTS[(group.label - 1) % CYCLE_TINTS.length]!;
