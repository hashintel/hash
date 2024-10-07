import { useLoadGraph, useRegisterEvents, useSigma } from "@react-sigma/core";
import { MultiDirectedGraph } from "graphology";
import { memo, useEffect, useRef } from "react";
import type { SigmaNodeEventPayload } from "sigma/types";

import type { GraphVizConfig } from "./config";
import { useFullScreen } from "./shared/full-screen";
import { useDefaultSettings } from "./shared/settings";
import type { GraphState } from "./shared/state";
import { useLayout } from "./use-layout";

export type GraphVizNode = {
  borderColor?: string;
  color: string;
  nodeId: string;
  nodeTypeId?: string;
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
  config: GraphVizConfig;
  edges: GraphVizEdge[];
  nodes: GraphVizNode[];
  onEdgeClick?: (params: { edgeId: string; isFullScreen: boolean }) => void;
  onNodeSecondClick?: (params: {
    nodeId: string;
    isFullScreen: boolean;
  }) => void;
};

export const GraphDataLoader = memo(
  ({
    config,
    edges,
    nodes,
    onNodeSecondClick,
    onEdgeClick,
  }: GraphLoaderProps) => {
    /**
     * Hooks provided by the react-sigma library to simplify working with the sigma instance.
     */
    const loadGraph = useLoadGraph();
    const registerEvents = useRegisterEvents();
    const sigma = useSigma();

    /**
     * Custom hooks for laying out the graph, and handling fullscreen state
     */
    const layout = useLayout();
    const { isFullScreen } = useFullScreen();

    /**
     * State to track interactions with the graph.
     * It's drawn in canvas so doesn't need to be in React state
     * – redrawing the graph is done via sigma.refresh.
     */
    const graphState = useRef<GraphState>({
      hoveredNodeId: null,
      hoveredNeighborIds: null,
      selectedNodeId: null,
    });

    useDefaultSettings(graphState.current);

    useEffect(() => {
      /**
       * Highlight a node and its neighbors up to a certain depth.
       */
      const highlightNode = (event: SigmaNodeEventPayload) => {
        graphState.current.hoveredNodeId = event.node;

        const getNeighbors = (
          nodeId: string,
          neighborIds: Set<string> = new Set(),
          depth = 1,
        ) => {
          if (depth > config.nodeHighlighting.depth) {
            return neighborIds;
          }

          let directNeighbors: string[];
          switch (config.nodeHighlighting.direction) {
            case "All":
              directNeighbors = sigma.getGraph().neighbors(nodeId);
              break;
            case "In":
              directNeighbors = sigma.getGraph().inNeighbors(nodeId);
              break;
            case "Out":
              directNeighbors = sigma.getGraph().outNeighbors(nodeId);
              break;
          }

          for (const neighbor of directNeighbors) {
            neighborIds.add(neighbor);
            getNeighbors(neighbor, neighborIds, depth + 1);
          }

          return neighborIds;
        };

        graphState.current.hoveredNeighborIds = getNeighbors(event.node);

        sigma.setSetting("renderEdgeLabels", true);

        /**
         * We haven't touched the graph data, so don't need to re-index.
         * An additional optimization would be to supply partialGraph here and only redraw the affected nodes,
         * but since the nodes whose appearance changes are the NON-highlighted nodes (they disappear), it's probably
         * not worth it
         * – they are likely to be the majority anyway, and we'd have to generate an array of them.
         */
        sigma.refresh({ skipIndexation: true });
      };

      const removeHighlights = () => {
        graphState.current.hoveredNodeId = null;
        graphState.current.hoveredNeighborIds = null;
        sigma.setSetting("renderEdgeLabels", false);
        sigma.refresh({ skipIndexation: true });
      };

      registerEvents({
        clickEdge: (event) => {
          onEdgeClick?.({
            edgeId: event.edge,
            isFullScreen,
          });
        },
        clickNode: (event) => {
          if (graphState.current.selectedNodeId === event.node) {
            /**
             * Only active when the node is already selected,
             * so that the first click performs the graph highlighting functions.
             */
            onNodeSecondClick?.({
              nodeId: event.node,
              isFullScreen,
            });
          }

          graphState.current.selectedNodeId = event.node;
          highlightNode(event);
        },
        clickStage: () => {
          if (!graphState.current.selectedNodeId) {
            return;
          }

          /**
           * If we click on the background (the 'stage'), deselect the selected node.
           */
          graphState.current.selectedNodeId = null;
          removeHighlights();
        },
        enterNode: (event) => {
          if (graphState.current.selectedNodeId) {
            /**
             * If a user has clicked on a node, don't do anything when hovering other over nodes,
             * because it makes it harder to click to highlight neighbors and then browse the highlighted graph.
             * They can click on the background or another node to deselect this one.
             */
            return;
          }

          highlightNode(event);
        },
        leaveNode: () => {
          if (graphState.current.selectedNodeId) {
            /**
             * If there's a selected node (has been clicked on), we don't want to remove highlights.
             * The user can click the background or another node to deselect it.
             */
            return;
          }
          removeHighlights();
        },
      });
    }, [
      config,
      edges,
      nodes,
      onEdgeClick,
      onNodeSecondClick,
      isFullScreen,
      registerEvents,
      sigma,
    ]);

    useEffect(() => {
      const graph = new MultiDirectedGraph();

      const nodeIdToEdgeCount: Record<
        string,
        { In: number; Out: number; All: number }
      > = {};

      const seenNodeIds = new Set<string>();

      for (const [index, node] of nodes.entries()) {
        if (
          config.filters.typeIds?.length &&
          !config.filters.typeIds.includes(node.nodeTypeId!)
        ) {
          continue;
        }

        graph.addNode(node.nodeId, {
          borderColor: node.borderColor ?? node.color,
          color: node.color,
          x: index % 20,
          y: Math.floor(index / 20),
          label: node.label,
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
          color: "rgba(50, 50, 50, 0.5)",
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
    }, [config, layout, loadGraph, sigma, nodes, edges]);

    return null;
  },
);
