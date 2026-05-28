import type { VisualizerView } from "../../visualizer-views";
import type { TraversalPath } from "@local/hash-graph-client";

/**
 * Graph view resolves links into and out of the displayed entities so link
 * endpoints render even when the entity filter is narrow.
 */
const graphViewTraversalPaths: TraversalPath[] = [
  {
    edges: [
      { kind: "has-left-entity", direction: "incoming" },
      { kind: "has-right-entity", direction: "outgoing" },
    ],
  },
];

/**
 * Table / Grid views only need to resolve a link entity's own source and
 * target endpoints.
 */
const tableViewTraversalPaths: TraversalPath[] = [
  {
    edges: [
      { kind: "has-left-entity", direction: "outgoing" },
      { kind: "has-right-entity", direction: "outgoing" },
    ],
  },
];

export const traversalPathsForView = (
  view: VisualizerView,
): TraversalPath[] => {
  return view === "Graph" ? graphViewTraversalPaths : tableViewTraversalPaths;
};
