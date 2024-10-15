import { useLoadGraph, useSigma } from "@react-sigma/core";
import { MultiDirectedGraph } from "graphology";
import { memo, useEffect } from "react";

import { useGraphContext } from "./shared/graph-context";
import type { RegisterEventsArgs } from "./shared/use-event-handlers";
import { useLayout } from "./use-layout";

export type GraphVizNode = {
  borderColor?: string;
  color: string;
  nodeId: string;
  nodeTypeId?: string;
  nodeTypeLabel?: string;
  label: string;
  size: number;
};

export type GraphVizEdge = {
  edgeId: string;
  label?: string;
  size: number;
  source: string;
  target: string;
};

export type GraphLoaderProps = {
  edges: GraphVizEdge[];
  nodes: GraphVizNode[];
} & Pick<RegisterEventsArgs, "onEdgeClick" | "onNodeSecondClick">;

export const GraphDataLoader = memo(({ edges, nodes }: GraphLoaderProps) => {
  /**
   * Hooks provided by the react-sigma library to simplify working with the sigma instance.
   */
  const loadGraph = useLoadGraph();
  const sigma = useSigma();

  const { config, filters } = useGraphContext();

  /**
   * Custom hooks for laying out the graph.
   */
  const layout = useLayout();

  useEffect(() => {
    const graph = new MultiDirectedGraph();

    const nodeIdToEdgeCount: Record<
      string,
      { In: number; Out: number; All: number }
    > = {};

    const seenNodeIds = new Set<string>();

    for (const [index, node] of nodes.entries()) {
      if (
        node.nodeTypeId &&
        filters.includeByNodeTypeId?.[node.nodeTypeId] === false
      ) {
        continue;
      }

      graph.addNode(node.nodeId, {
        borderColor: node.borderColor ?? node.color,
        /**
         * This color may be overwritten in the reducer {@link useSetDrawSettings}
         * We don't want this effect depending on the color options,
         * because we don't want to lay out the graph again if the color of nodes change.
         */
        color: node.color,
        x: index % 20,
        y: Math.floor(index / 20),
        label: node.label,
        nodeTypeId: node.nodeTypeId,
        size:
          config.nodeSizing.mode === "byEdgeCount"
            ? config.nodeSizing.min
            : node.size,
        type: "bordered",
      });

      seenNodeIds.add(node.nodeId);
    }

    for (const edge of edges) {
      const { source, target } = edge;

      if (!seenNodeIds.has(source) || !seenNodeIds.has(target)) {
        continue;
      }

      graph.addEdgeWithKey(edge.edgeId, source, target, {
        color: "rgba(90, 90, 90, 0.5)",
        label: edge.label,
        size: edge.size,
        type: "curved",
      });

      nodeIdToEdgeCount[source] ??= { In: 0, Out: 0, All: 0 };
      nodeIdToEdgeCount[source].Out++;
      nodeIdToEdgeCount[source].All++;

      nodeIdToEdgeCount[target] ??= { In: 0, Out: 0, All: 0 };
      nodeIdToEdgeCount[target].In++;
      nodeIdToEdgeCount[target].All++;
    }

    if (config.nodeSizing.mode === "byEdgeCount") {
      const countKey = config.nodeSizing.countEdges;

      const countValues = Object.values(nodeIdToEdgeCount).map(
        (counts) => counts[countKey],
      );

      const lowestCount = Math.min(...countValues);
      const highestCount = Math.max(...countValues);

      const range = highestCount - lowestCount;

      if (range === 0 && countValues.length === seenNodeIds.size) {
        /**
         * All nodes have the same count, so we don't need to resize any.
         */
      } else {
        const maxNodeSize = config.nodeSizing.max;
        const minNodeSize = config.nodeSizing.min;

        for (const [nodeId, counts] of Object.entries(nodeIdToEdgeCount)) {
          const relativeEdgeCount = counts[countKey] / range;

          const maxSizeIncrease = maxNodeSize - minNodeSize;

          const relativeSize = Math.floor(
            Math.min(
              maxNodeSize,
              Math.max(
                minNodeSize,
                relativeEdgeCount * maxSizeIncrease + minNodeSize,
              ),
            ),
          );

          if (relativeSize !== minNodeSize) {
            /**
             * Scale the size of the node based on its count for the edges of interest,
             * relative to the range of counts across all nodes.
             */
            graph.setNodeAttribute(nodeId, "size", relativeSize);
          }
        }
      }
    }

    loadGraph(graph);

    layout();
  }, [
    /**
     * These are the config options that affect the layout and/or what nodes are included.
     * We exclude config.nodeHighlighting as it doesn't affect the graph, only what is highlighted on hover/click.
     * Re-rendering the graph without needing to lay it out again is handled in {@link ConfigControl}
     */
    config.nodeSizing,
    /**
     * We don't include filters.colorByNodeTypeId here because it doesn't affect the layout of the graph.
     * {@link FilterControl} handles re-rendering the graph when the colors change.
     */
    filters.includeByNodeTypeId,
    layout,
    loadGraph,
    sigma,
    nodes,
    edges,
  ]);

  return null;
});
