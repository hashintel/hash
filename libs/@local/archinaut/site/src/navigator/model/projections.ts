/**
 * Projections: pure functions from the graph to what a view draws. An
 * interface is a node with a spoke to each participant; membership sets
 * (domain, search) decide what is emphasised, and the layer tree stays
 * visible behind them.
 */

import { ancestorIds, summaryOf, type GraphIndex } from "./graph";

import type { Participant } from "../../../../src/model";

export type ProjectedEdgeKind = "imports" | "declared" | "spoke";

export interface ProjectedEdge {
  id: string;
  from: string;
  to: string;
  kind: ProjectedEdgeKind;
  weight: number;
  label: string | null;
  role: Participant["role"] | null;
}

export const projectEdges = (index: GraphIndex): ProjectedEdge[] => {
  const edges: ProjectedEdge[] = index.model.edges.map((edge) =>
    edge.kind === "imports"
      ? {
          id: `i:${edge.from}>${edge.to}`,
          from: edge.from,
          to: edge.to,
          kind: "imports",
          weight: edge.weight,
          label: null,
          role: null,
        }
      : {
          id: `d:${edge.from}>${edge.to}`,
          from: edge.from,
          to: edge.to,
          kind: "declared",
          weight: 1,
          label: edge.protocol,
          role: null,
        },
  );
  for (const node of index.model.interfaces) {
    for (const participant of node.participants) {
      edges.push({
        id: `s:${participant.node}>${node.id}`,
        from: participant.node,
        to: node.id,
        kind: "spoke",
        weight: 1,
        label: null,
        role: participant.role,
      });
    }
  }
  return edges;
};

const withAncestors = (members: Set<string>): Set<string> => {
  for (const id of [...members]) {
    if (!id.includes(":")) {
      for (const ancestor of ancestorIds(id)) {
        members.add(ancestor);
      }
    }
  }
  return members;
};

/** Nodes carrying any of the tags, plus the ancestors that frame them. Null means no filter. */
export const domainMembers = (
  index: GraphIndex,
  tags: readonly string[],
): Set<string> | null => {
  if (tags.length === 0) {
    return null;
  }
  const members = new Set<string>();
  for (const node of index.nodes.values()) {
    if (node.tags.some((tag) => tags.includes(tag))) {
      members.add(node.id);
    }
  }
  return withAncestors(members);
};

/** Nodes whose id, name, summary or tags contain the query. Null means no query. */
export const searchMatches = (
  index: GraphIndex,
  query: string,
): Set<string> | null => {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return null;
  }
  const members = new Set<string>();
  for (const node of index.nodes.values()) {
    const haystack = [node.id, node.name, summaryOf(node), ...node.tags]
      .join(" ")
      .toLowerCase();
    if (haystack.includes(needle)) {
      members.add(node.id);
    }
  }
  return withAncestors(members);
};

export interface Neighbourhood {
  /** Nodes one edge away from the focus. */
  ring1: string[];
  /** Other participants of the interfaces in ring 1. */
  ring2: string[];
}

export const neighbourhood = (
  index: GraphIndex,
  focus: string,
  edges: ProjectedEdge[],
): Neighbourhood => {
  const ring1 = new Set<string>();
  for (const edge of edges) {
    if (edge.from === focus) {
      ring1.add(edge.to);
    } else if (edge.to === focus) {
      ring1.add(edge.from);
    }
  }
  const ring2 = new Set<string>();
  for (const id of ring1) {
    const node = index.interfaces.get(id);
    if (node === undefined) {
      continue;
    }
    for (const participant of node.participants) {
      if (participant.node !== focus && !ring1.has(participant.node)) {
        ring2.add(participant.node);
      }
    }
  }
  const rank = (id: string): number => {
    if (index.interfaces.has(id)) {
      return 0;
    }
    return edges.some((edge) => edge.from === focus && edge.to === id) ? 1 : 2;
  };
  const byRankThenId = (left: string, right: string): number =>
    rank(left) - rank(right) || left.localeCompare(right);
  return {
    ring1: [...ring1].sort(byRankThenId),
    ring2: [...ring2].sort(),
  };
};
