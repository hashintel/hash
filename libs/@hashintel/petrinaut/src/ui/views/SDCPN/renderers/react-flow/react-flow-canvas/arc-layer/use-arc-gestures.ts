import { useStoreApi } from "@xyflow/react";

import type { ArcLayerGestures } from "../arc-layer-context";
import type { ArcShape } from "./arc-shapes";

/** The keys that act on a focused edge of React Flow. */
const selectionKeys = ["Enter", " ", "Escape"];

/** The arc's element that `target` is, or is inside. */
const arcItemOf = (target: EventTarget | null): SVGGElement | null =>
  target instanceof Element ? target.closest<SVGGElement>(".arc-item") : null;

type ArcHandlers = Pick<
  React.SVGAttributes<SVGGElement>,
  "onClick" | "onMouseOver" | "onMouseOut" | "onKeyDown"
>;

/**
 * What a click, the pointer and the keys do on an arc, as handlers for the
 * one element that holds every arc's element.
 *
 * React Flow's wrapper around an edge did the same for each arc: it tells
 * React Flow's own selection about the arc, which deselects the nodes and
 * the other edges, and the canvas then selects the arc. The calls into React
 * Flow's store are the wrapper's, in its order.
 */
export const useArcGestures = (
  { selectLink, enterItem, clearHover, isAddMode }: ArcLayerGestures,
  shapes: readonly ArcShape[],
): ArcHandlers => {
  const store = useStoreApi();

  /** The arc as an edge of React Flow, for the calls that take one. */
  const edgeOf = (item: SVGGElement) => {
    const shape = shapes.find((candidate) => candidate.id === item.dataset.id);
    return shape
      ? {
          id: shape.id,
          source: shape.sourceId,
          target: shape.targetId,
          selected: shape.selected,
        }
      : null;
  };

  return {
    onClick: (event) => {
      const item = arcItemOf(event.target);
      const edge = item ? edgeOf(item) : null;
      if (!item || !edge) {
        return;
      }
      // Nothing is selectable while a node is being added, as React Flow has
      // it: the click reaches the canvas's own selection alone.
      if (!isAddMode) {
        const {
          addSelectedEdges,
          unselectNodesAndEdges,
          multiSelectionActive,
        } = store.getState();
        store.setState({ nodesSelectionActive: false });
        if (edge.selected && multiSelectionActive) {
          unselectNodesAndEdges({ nodes: [], edges: [edge] });
          item.blur();
        } else {
          addSelectedEdges([edge.id]);
        }
      }
      selectLink({ type: "arc", id: edge.id });
    },

    // The pointer comes onto an arc when what it left is not of that arc,
    // and leaves one when what it goes to is not. Between two arcs the one
    // it leaves is cleared first: with a button down, entering an arc does
    // not replace what is hovered.
    onMouseOver: (event) => {
      const item = arcItemOf(event.target);
      if (item?.dataset.id && item !== arcItemOf(event.relatedTarget)) {
        enterItem(event, item.dataset.id);
      }
    },
    onMouseOut: (event) => {
      const item = arcItemOf(event.target);
      if (item && item !== arcItemOf(event.relatedTarget)) {
        clearHover();
      }
    },

    onKeyDown: (event) => {
      const item = arcItemOf(event.target);
      const edge = item ? edgeOf(item) : null;
      if (!item || !edge || isAddMode || !selectionKeys.includes(event.key)) {
        return;
      }
      const { addSelectedEdges, unselectNodesAndEdges } = store.getState();
      if (event.key === "Escape") {
        item.blur();
        unselectNodesAndEdges({ edges: [edge] });
      } else {
        addSelectedEdges([edge.id]);
      }
    },
  };
};
