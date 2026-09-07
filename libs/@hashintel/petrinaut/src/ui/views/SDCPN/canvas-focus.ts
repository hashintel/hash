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
import type { Transition } from "@hashintel/petrinaut-core";

/** Where a node sits relative to the focused item. */
export type CanvasNodeFocus =
  /** Nothing is focused: the net is drawn plainly. */
  | "none"
  /** The focused item itself. */
  | "focused"
  /** Feeds the focused item. */
  | "upstream"
  /** Fed by the focused item. */
  | "downstream"
  /** Both, so a cycle runs through the focused item. */
  | "bidirectional"
  /** Unrelated to the focused item. */
  | "muted";

/** Where an arc sits relative to the focused item. */
export type CanvasArcFocus =
  | "none"
  /** The focused arc, or an arc between two focused items. */
  | "focused"
  /** Carries tokens into the focused item. */
  | "incoming"
  /** Carries tokens out of the focused item. */
  | "outgoing"
  | "muted";

export type CanvasFocus = {
  /** Whether anything on the canvas is focused. */
  active: boolean;
  /** The canvas item under the pointer, once the hover has settled. */
  hoveredId: string | null;
  nodeFocus: (id: string) => CanvasNodeFocus;
  arcFocus: (id: string) => CanvasArcFocus;
};

export type CanvasFocusInput = {
  net: ActiveNetDefinition;
  /**
   * The hovered item, after the hover delay. Takes precedence over the
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
};

type DirectedArc = { id: string; sourceId: string; targetId: string };

/** Every arc in token-flow direction: place → transition → place. */
const directedArcs = (transitions: readonly Transition[]): DirectedArc[] => {
  const arcs: DirectedArc[] = [];

  for (const transition of transitions) {
    for (const inputArc of transition.inputArcs) {
      const endpoint = getArcEndpoint(inputArc);
      arcs.push({
        id: generateArcId({
          inputId: getArcEndpointKey(endpoint),
          outputId: transition.id,
        }),
        sourceId: getArcEndpointNodeId(endpoint),
        targetId: transition.id,
      });
    }

    for (const outputArc of transition.outputArcs) {
      const endpoint = getArcEndpoint(outputArc);
      arcs.push({
        id: generateArcId({
          inputId: transition.id,
          outputId: getArcEndpointKey(endpoint),
        }),
        sourceId: transition.id,
        targetId: getArcEndpointNodeId(endpoint),
      });
    }
  }

  return arcs;
};

const NOTHING_FOCUSED: CanvasFocus = {
  active: false,
  hoveredId: null,
  nodeFocus: () => "none",
  arcFocus: () => "none",
};

/**
 * The focus roles for one net. Ids that name something off the canvas — a
 * type or a parameter selected in the sidebar, say — focus nothing, so
 * selecting one leaves the net drawn plainly.
 */
export const buildCanvasFocus = ({
  net,
  hoveredId,
  selectedIds,
}: CanvasFocusInput): CanvasFocus => {
  const arcs = directedArcs(net.transitions);

  const canvasIds = new Set<string>([
    ...net.places.map(({ id }) => id),
    ...net.transitions.map(({ id }) => id),
    ...net.componentInstances.map(({ id }) => id),
    ...arcs.map(({ id }) => id),
  ]);

  const selectedCanvasIds = new Set(
    [...selectedIds].filter((id) => canvasIds.has(id)),
  );

  const focusIds =
    hoveredId !== null && canvasIds.has(hoveredId)
      ? new Set([hoveredId])
      : selectedCanvasIds;

  if (focusIds.size === 0) {
    return NOTHING_FOCUSED;
  }

  const isFocused = (id: string) =>
    focusIds.has(id) || selectedCanvasIds.has(id);

  const upstream = new Set<string>();
  const downstream = new Set<string>();
  const incoming = new Set<string>();
  const outgoing = new Set<string>();

  for (const arc of arcs) {
    if (focusIds.has(arc.targetId)) {
      upstream.add(arc.sourceId);
      incoming.add(arc.id);
    }
    if (focusIds.has(arc.sourceId)) {
      downstream.add(arc.targetId);
      outgoing.add(arc.id);
    }
    // A focused arc puts the nodes it joins either side of the focus.
    if (focusIds.has(arc.id)) {
      upstream.add(arc.sourceId);
      downstream.add(arc.targetId);
    }
  }

  return {
    active: true,
    hoveredId: hoveredId !== null && focusIds.has(hoveredId) ? hoveredId : null,

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
      return "muted";
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
      return "muted";
    },
  };
};
