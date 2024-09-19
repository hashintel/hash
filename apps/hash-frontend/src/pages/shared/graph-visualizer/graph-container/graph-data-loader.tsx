import { useLoadGraph, useRegisterEvents, useSigma } from "@react-sigma/core";
import { MultiDirectedGraph } from "graphology";
import { useEffect, useRef } from "react";
import type { SigmaNodeEventPayload } from "sigma/types";

import { useFullScreen } from "./shared/full-screen";
import { useDefaultSettings } from "./shared/settings";
import type { GraphState } from "./shared/state";
import { useLayout } from "./use-layout";

export type GraphVizNode = {
  borderColor?: string;
  color: string;
  nodeId: string;
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
  highlightDepth: number;
  edges: GraphVizEdge[];
  nodes: GraphVizNode[];
  onEdgeClick?: (params: { edgeId: string; isFullScreen: boolean }) => void;
  onNodeClick?: (params: { nodeId: string; isFullScreen: boolean }) => void;
};

export const GraphDataLoader = ({
  highlightDepth,
  edges,
  nodes,
  onNodeClick,
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
        if (depth > highlightDepth) {
          return neighborIds;
        }

        const directNeighbors = sigma.getGraph().neighbors(nodeId);

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
       * but since the nodes whose appearance changes are the NON-highlighted nodes (they disappear), it's probably not worth it
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
        onNodeClick?.({
          nodeId: event.node,
          isFullScreen,
        });

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
        graphState.current.selectedNodeId = null;
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
    edges,
    nodes,
    onEdgeClick,
    onNodeClick,
    highlightDepth,
    isFullScreen,
    registerEvents,
    sigma,
  ]);

  useEffect(() => {
    const graph = new MultiDirectedGraph();

    for (const [index, node] of nodes.entries()) {
      graph.addNode(node.nodeId, {
        borderColor: node.borderColor ?? node.color,
        color: node.color,
        x: index % 20,
        y: Math.floor(index / 20),
        label: node.label,
        size: node.size,
        type: "bordered",
      });
    }

    for (const edge of edges) {
      graph.addEdgeWithKey(edge.edgeId, edge.source, edge.target, {
        color: "rgba(230, 230, 230, 1)",
        label: edge.label,
        size: edge.size,
        type: "arrow",
      });
    }

    loadGraph(graph);

    layout();
  }, [layout, loadGraph, sigma, nodes, edges]);

  return null;
};
