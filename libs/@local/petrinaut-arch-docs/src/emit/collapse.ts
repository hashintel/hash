/**
 * Collapsing the layer tree, and what that does to the edges.
 *
 * The interactive diagram lets a reader fold a layer's children away. Every
 * fold changes which nodes exist, which means every edge has to be re-pointed
 * at whatever is still visible. That re-pointing is the whole of this module,
 * and it is pure: given the model and a set of collapsed layers it returns the
 * graph to draw. No layout, no rendering, no DOM.
 *
 * It lives in the generator rather than the browser because the set of reachable
 * fold states is small and enumerable — 30 for the current model — so every one
 * can be laid out at build time and shipped as coordinates. That keeps ELK off
 * the client and makes the whole thing unit-testable.
 */

import { ancestorLayerIds, type Edge, type Layer } from "../model";

/** A node in the drawn graph: a layer that is currently visible. */
export interface VisibleNode {
  id: string;
  /** Enclosing visible layer, or null at the top level. */
  parent: string | null;
  name: string;
  role: string;
  package: string;
  /** True when this node has children that are currently folded away. */
  collapsed: boolean;
  /** Files in this layer, plus every descendant folded into it. */
  fileCount: number;
  /** Descendant layers folded into this node. Zero when expanded or a leaf. */
  foldedLayers: number;
  /**
   * Dependencies that exist inside this node and so are not drawn.
   *
   * Two cases end up here: an edge between two layers folded into this one, and
   * an edge between this layer's own files and something nested inside it. Both
   * are real imports, and an arrow from a box to the box containing it reads as
   * noise, so the count is surfaced on the node instead of drawn.
   */
  internalDependencies: number;
}

/**
 * An edge in the drawn graph, aggregated up to the visible nodes.
 *
 * Reciprocal pairs are merged into one record: two opposing arrows between the
 * same boxes is a rendering artefact, not a fact about the code. `forward` and
 * `reverse` keep both real counts.
 */
export interface VisibleEdge {
  from: string;
  to: string;
  /** File-level imports `from` → `to`. */
  forward: number;
  /** File-level imports `to` → `from`. Zero unless the pair is reciprocal. */
  reverse: number;
  crossesPackage: boolean;
}

export interface VisibleGraph {
  nodes: VisibleNode[];
  edges: VisibleEdge[];
}

/** A reachable fold state, identified by the layers folded in it. */
export interface CollapseState {
  /**
   * Canonical identifier: collapsed ids sorted and joined with `+`, or `_` when
   * nothing is collapsed. Used as the key a client looks a layout up by, so it
   * has to be derivable on both sides from the collapsed set alone.
   */
  key: string;
  collapsed: string[];
}

const childrenOf = (layers: Layer[], id: string | null): Layer[] =>
  layers.filter((layer) => layer.parent === id);

export const collapseStateKey = (collapsed: Iterable<string>): string => {
  const sorted = [...collapsed].sort((left, right) =>
    left.localeCompare(right),
  );
  return sorted.length === 0 ? "_" : sorted.join("+");
};

/**
 * Every fold state a reader can actually reach.
 *
 * Folding a layer makes its descendants' own fold states unobservable, so those
 * combinations are not distinct states and are not enumerated. That is the
 * difference between 2^6 = 64 naive combinations and the 30 real ones: `core`
 * folded is one state, not the four its two nested parents would otherwise
 * multiply it into.
 */
export const enumerateCollapseStates = (layers: Layer[]): CollapseState[] => {
  /**
   * Every distinct fold state of a set of sibling subtrees, as a cartesian
   * product: each sibling contributes its own options independently.
   *
   * A sibling with children offers `[[itself folded], ...each state of its
   * children]` — folded is one option, not one per descendant combination,
   * which is what collapses 64 naive combinations to 30 real ones.
   */
  function combinations(siblings: Layer[]): string[][] {
    return siblings.reduce<string[][]>(
      (accumulated, sibling) => {
        const children = childrenOf(layers, sibling.id);
        const options =
          children.length === 0
            ? [[]]
            : [[sibling.id], ...combinations(children)];

        return accumulated.flatMap((prefix) =>
          options.map((option) => [...prefix, ...option]),
        );
      },
      [[]],
    );
  }

  const seen = new Set<string>();
  const states: CollapseState[] = [];

  for (const collapsed of combinations(childrenOf(layers, null))) {
    const key = collapseStateKey(collapsed);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    states.push({
      key,
      collapsed: [...collapsed].sort((left, right) =>
        left.localeCompare(right),
      ),
    });
  }

  return states;
};

/**
 * The graph to draw for one fold state.
 *
 * A layer is visible when no ancestor of it is collapsed. Every layer that is
 * not visible is represented by its nearest visible ancestor, and every edge
 * follows: both endpoints are replaced by their representative, and what is left
 * is either an edge between two boxes or a dependency inside one.
 */
export const visibleGraph = (
  layers: Layer[],
  edges: Edge[],
  collapsed: Iterable<string>,
): VisibleGraph => {
  const collapsedSet = new Set(collapsed);

  const isVisible = (id: string): boolean =>
    ancestorLayerIds(id).every((ancestor) => !collapsedSet.has(ancestor));

  /** The visible layer that stands in for `id` — itself, or its nearest visible ancestor. */
  const representativeOf = (id: string): string => {
    if (isVisible(id)) {
      return id;
    }
    // Ancestors are nearest-first, so the first visible one is the representative.
    return ancestorLayerIds(id).find((ancestor) => isVisible(ancestor)) ?? id;
  };

  const visible = layers.filter((layer) => isVisible(layer.id));

  const descendantsOf = (id: string): Layer[] =>
    layers.filter((layer) => layer.id.startsWith(`${id}.`));

  const internalDependencies = new Map<string, number>();
  const addInternal = (id: string, count: number): void => {
    internalDependencies.set(id, (internalDependencies.get(id) ?? 0) + count);
  };

  const directed = new Map<
    string,
    { from: string; to: string; count: number; crossesPackage: boolean }
  >();

  for (const edge of edges) {
    const from = representativeOf(edge.from);
    const to = representativeOf(edge.to);

    if (from === to) {
      addInternal(from, edge.fileDependencies);
      continue;
    }

    // A box and the box that contains it. Real, but not drawable as an arrow.
    if (from.startsWith(`${to}.`)) {
      addInternal(to, edge.fileDependencies);
      continue;
    }
    if (to.startsWith(`${from}.`)) {
      addInternal(from, edge.fileDependencies);
      continue;
    }

    const key = `${from} ${to}`;
    const existing = directed.get(key);
    if (existing) {
      existing.count += edge.fileDependencies;
      existing.crossesPackage ||= edge.crossesPackage;
    } else {
      directed.set(key, {
        from,
        to,
        count: edge.fileDependencies,
        crossesPackage: edge.crossesPackage,
      });
    }
  }

  const merged = new Map<string, VisibleEdge>();

  for (const { from, to, count, crossesPackage } of directed.values()) {
    // Reciprocal pairs share one record, keyed on the unordered pair.
    const pairKey = [from, to]
      .slice()
      .sort((left, right) => left.localeCompare(right))
      .join(" ");
    const existing = merged.get(pairKey);

    if (existing === undefined) {
      merged.set(pairKey, {
        from,
        to,
        forward: count,
        reverse: 0,
        crossesPackage,
      });
      continue;
    }

    if (existing.from === from) {
      existing.forward += count;
    } else {
      existing.reverse += count;
    }
    existing.crossesPackage ||= crossesPackage;
  }

  const nodes: VisibleNode[] = visible.map((layer) => {
    const isCollapsed = collapsedSet.has(layer.id);
    const folded = isCollapsed ? descendantsOf(layer.id) : [];

    return {
      id: layer.id,
      parent: layer.parent,
      name: layer.name,
      role: layer.role,
      package: layer.package,
      collapsed: isCollapsed,
      fileCount:
        layer.fileCount +
        folded.reduce((total, child) => total + child.fileCount, 0),
      foldedLayers: folded.length,
      internalDependencies: internalDependencies.get(layer.id) ?? 0,
    };
  });

  return {
    nodes: nodes.sort((left, right) => left.id.localeCompare(right.id)),
    edges: [...merged.values()].sort(
      (left, right) =>
        left.from.localeCompare(right.from) || left.to.localeCompare(right.to),
    ),
  };
};

/** Layers that have children, and so can be folded. */
export const collapsibleLayerIds = (layers: Layer[]): string[] =>
  layers
    .filter((layer) => layers.some((other) => other.parent === layer.id))
    .map((layer) => layer.id)
    .sort((left, right) => left.localeCompare(right));
