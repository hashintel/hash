/**
 * Projections: pure functions from the graph to what a view draws.
 *
 * The same model reads two ways. In the hypergraph projection an interface
 * is a node with a spoke to each participant. In the pairwise projection an
 * interface expands into consumer-to-provider edges and the same interface
 * can appear several times. Membership sets (domain, audience, search)
 * decide what is emphasised; the layer tree stays visible behind them.
 */

import { ancestorIds, summaryOf, type GraphIndex } from "./graph";

import type { Audience, Participant } from "../../../../src/model";

export type Projection = "pairwise" | "hypergraph";

export interface EdgeKinds {
  imports: boolean;
  declared: boolean;
  interfaces: boolean;
}

export type ProjectedEdgeKind =
  | "imports"
  | "declared"
  | "interface-pair"
  | "implements"
  | "spoke";

export interface ProjectedEdge {
  id: string;
  from: string;
  to: string;
  kind: ProjectedEdgeKind;
  weight: number;
  label: string | null;
  interfaceId: string | null;
  role: Participant["role"] | null;
}

export const projectEdges = (
  index: GraphIndex,
  projection: Projection,
  kinds: EdgeKinds,
): ProjectedEdge[] => {
  const edges: ProjectedEdge[] = [];

  for (const edge of index.model.edges) {
    if (edge.kind === "imports") {
      if (kinds.imports) {
        edges.push({
          id: `i:${edge.from}>${edge.to}`,
          from: edge.from,
          to: edge.to,
          kind: "imports",
          weight: edge.weight,
          label: null,
          interfaceId: null,
          role: null,
        });
      }
    } else if (kinds.declared) {
      edges.push({
        id: `d:${edge.from}>${edge.to}`,
        from: edge.from,
        to: edge.to,
        kind: "declared",
        weight: 1,
        label: edge.protocol,
        interfaceId: null,
        role: null,
      });
    }
  }

  if (!kinds.interfaces) {
    return edges;
  }

  for (const node of index.model.interfaces) {
    if (projection === "hypergraph") {
      for (const participant of node.participants) {
        edges.push({
          id: `s:${participant.node}>${node.id}`,
          from: participant.node,
          to: node.id,
          kind: "spoke",
          weight: 1,
          label: null,
          interfaceId: node.id,
          role: participant.role,
        });
      }
      continue;
    }

    const providers = node.participants.filter(
      (participant) =>
        participant.role === "provides" || participant.role === "implements",
    );
    const owners = node.participants.filter(
      (participant) => participant.role === "defines",
    );
    const consumers = node.participants.filter(
      (participant) => participant.role === "consumes",
    );
    const targets = providers.length > 0 ? providers : owners;

    for (const consumer of consumers) {
      for (const target of targets) {
        if (consumer.node === target.node) {
          continue;
        }
        edges.push({
          id: `p:${node.id}:${consumer.node}>${target.node}`,
          from: consumer.node,
          to: target.node,
          kind: "interface-pair",
          weight: 1,
          label: node.name,
          interfaceId: node.id,
          role: null,
        });
      }
    }
    for (const provider of providers) {
      for (const owner of owners) {
        if (provider.node === owner.node) {
          continue;
        }
        edges.push({
          id: `m:${node.id}:${provider.node}>${owner.node}`,
          from: provider.node,
          to: owner.node,
          kind: "implements",
          weight: 1,
          label: node.name,
          interfaceId: node.id,
          role: "implements",
        });
      }
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

/** Nodes written for an audience. Null means no filter. */
export const audienceMembers = (
  index: GraphIndex,
  audience: Audience | null,
): Set<string> | null => {
  if (audience === null) {
    return null;
  }
  const members = new Set<string>();
  for (const node of index.nodes.values()) {
    if (node.audience.includes(audience)) {
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
