/**
 * How each item on the canvas stands to the item the canvas is focused on:
 * whatever is under the pointer, or the current selection when nothing is
 * hovered.
 *
 * Direction is what the roles carry — a neighbour that feeds the focused item
 * is upstream, one it feeds is downstream — so the canvas can show a
 * neighbourhood in colour, the way the Notebook's net graph does, rather than
 * fading the rest of the net away.
 */

import {
  generateArcId,
  getArcEndpoint,
  getArcEndpointKey,
  getArcEndpointNodeId,
} from "@hashintel/petrinaut-core";

import type { ActiveNetDefinition } from "../../../react/state/active-net-context";

/**
 * Where a node sits relative to the focused item. An unrelated node has no
 * role: `active` tells the pane to mute everything that carries none, so a
 * hover leaves those nodes' own data untouched.
 */
export type CanvasNodeFocus =
  /** Nothing is focused, or nothing relates this node to what is. */
  | "none"
  /** The focused item itself. */
  | "focused"
  /** Feeds the focused item. */
  | "upstream"
  /** Fed by the focused item. */
  | "downstream"
  /** Both, so a cycle runs through the focused item. */
  | "bidirectional";

/** Where an arc sits relative to the focused item. */
export type CanvasArcFocus =
  | "none"
  /** The focused arc, or an arc between two focused items. */
  | "focused"
  /** Carries tokens into the focused item. */
  | "incoming"
  /** Carries tokens out of the focused item. */
  | "outgoing";

export type CanvasFocus = {
  /** Whether anything on the canvas is focused. */
  active: boolean;
  nodeFocus: (id: string) => CanvasNodeFocus;
  arcFocus: (id: string) => CanvasArcFocus;
};

/** What one node is joined to, in token-flow direction. */
type NodeAdjacency = {
  /** Nodes feeding this one. */
  upstream: string[];
  /** Nodes this one feeds. */
  downstream: string[];
  /** Arcs carrying tokens into this one. */
  incoming: string[];
  /** Arcs carrying tokens out of it. */
  outgoing: string[];
};

/**
 * The net's shape, indexed for lookup.
 *
 * Built once per net and reused across renders, so resolving a focus costs
 * the size of the neighbourhood rather than a walk over every transition and
 * arc in the net.
 */
export type NetAdjacency = {
  /** Every id the canvas draws: nodes and arcs. */
  canvasIds: ReadonlySet<string>;
  byNode: ReadonlyMap<string, NodeAdjacency>;
  /** The nodes an arc joins, for a focus that lands on the arc itself. */
  arcEnds: ReadonlyMap<string, { sourceId: string; targetId: string }>;
};

const emptyAdjacency = (): NodeAdjacency => ({
  upstream: [],
  downstream: [],
  incoming: [],
  outgoing: [],
});

/**
 * Index one net. Walks its transitions once; every later question about a
 * neighbourhood is a map lookup.
 */
export const buildNetAdjacency = (net: ActiveNetDefinition): NetAdjacency => {
  const byNode = new Map<string, NodeAdjacency>();
  const arcEnds = new Map<string, { sourceId: string; targetId: string }>();
  const canvasIds = new Set<string>();

  const entryFor = (id: string): NodeAdjacency => {
    const existing = byNode.get(id);
    if (existing) {
      return existing;
    }
    const created = emptyAdjacency();
    byNode.set(id, created);
    return created;
  };

  for (const place of net.places) {
    canvasIds.add(place.id);
    entryFor(place.id);
  }
  for (const transition of net.transitions) {
    canvasIds.add(transition.id);
    entryFor(transition.id);
  }
  for (const instance of net.componentInstances) {
    canvasIds.add(instance.id);
    entryFor(instance.id);
  }

  const join = (arcId: string, sourceId: string, targetId: string) => {
    canvasIds.add(arcId);
    arcEnds.set(arcId, { sourceId, targetId });
    const source = entryFor(sourceId);
    const target = entryFor(targetId);
    source.downstream.push(targetId);
    source.outgoing.push(arcId);
    target.upstream.push(sourceId);
    target.incoming.push(arcId);
  };

  for (const transition of net.transitions) {
    for (const inputArc of transition.inputArcs) {
      const endpoint = getArcEndpoint(inputArc);
      join(
        generateArcId({
          inputId: getArcEndpointKey(endpoint),
          outputId: transition.id,
        }),
        getArcEndpointNodeId(endpoint),
        transition.id,
      );
    }

    for (const outputArc of transition.outputArcs) {
      const endpoint = getArcEndpoint(outputArc);
      join(
        generateArcId({
          inputId: transition.id,
          outputId: getArcEndpointKey(endpoint),
        }),
        transition.id,
        getArcEndpointNodeId(endpoint),
      );
    }
  }

  return { canvasIds, byNode, arcEnds };
};

const NOTHING_FOCUSED: CanvasFocus = {
  active: false,
  nodeFocus: () => "none",
  arcFocus: () => "none",
};

/**
 * The focus roles for one net, read off its index. Ids that name something
 * off the canvas — a type or a parameter selected in the sidebar, say — focus
 * nothing, so selecting one leaves the net drawn plainly.
 */
export const resolveCanvasFocus = ({
  adjacency,
  hoveredId,
  selectedIds,
}: {
  adjacency: NetAdjacency;
  /**
   * The hovered item, once the pointer has settled. Takes precedence over the
   * selection, so pointing at a node previews its neighbourhood without
   * disturbing what is selected.
   */
  hoveredId: string | null;
  /**
   * The selection. It supplies the focus when nothing is hovered, and a
   * selected item stays ringed either way — hovering elsewhere must not make
   * the user lose sight of what they have selected.
   */
  selectedIds: ReadonlySet<string>;
}): CanvasFocus => {
  const selectedCanvasIds = new Set<string>();
  for (const id of selectedIds) {
    if (adjacency.canvasIds.has(id)) {
      selectedCanvasIds.add(id);
    }
  }

  const focusIds =
    hoveredId !== null && adjacency.canvasIds.has(hoveredId)
      ? new Set([hoveredId])
      : selectedCanvasIds;

  if (focusIds.size === 0) {
    return NOTHING_FOCUSED;
  }

  // Only the focused items are visited, so this costs the neighbourhood
  // rather than the net.
  const upstream = new Set<string>();
  const downstream = new Set<string>();
  const incoming = new Set<string>();
  const outgoing = new Set<string>();

  for (const id of focusIds) {
    const node = adjacency.byNode.get(id);
    if (node) {
      for (const other of node.upstream) upstream.add(other);
      for (const other of node.downstream) downstream.add(other);
      for (const arc of node.incoming) incoming.add(arc);
      for (const arc of node.outgoing) outgoing.add(arc);
      continue;
    }
    // A focused arc puts the nodes it joins either side of the focus.
    const ends = adjacency.arcEnds.get(id);
    if (ends) {
      upstream.add(ends.sourceId);
      downstream.add(ends.targetId);
    }
  }

  const isFocused = (id: string) =>
    focusIds.has(id) || selectedCanvasIds.has(id);

  return {
    active: true,

    nodeFocus: (id) => {
      if (isFocused(id)) {
        return "focused";
      }
      const feedsFocus = upstream.has(id);
      const fedByFocus = downstream.has(id);
      if (feedsFocus && fedByFocus) {
        return "bidirectional";
      }
      if (feedsFocus) {
        return "upstream";
      }
      if (fedByFocus) {
        return "downstream";
      }
      return "none";
    },

    arcFocus: (id) => {
      if (isFocused(id)) {
        return "focused";
      }
      const intoFocus = incoming.has(id);
      const outOfFocus = outgoing.has(id);
      // Both ends focused: the arc runs inside the focus rather than to it.
      if (intoFocus && outOfFocus) {
        return "focused";
      }
      if (intoFocus) {
        return "incoming";
      }
      if (outOfFocus) {
        return "outgoing";
      }
      return "none";
    },
  };
};
