import { useRegisterEvents, useSigma } from "@react-sigma/core";
import type { RefObject } from "react";
import { useCallback, useEffect } from "react";

import type { GraphVizConfig } from "./config-control";
import { useFullScreen } from "./full-screen-context";
import type { GraphState } from "./state";

export type RegisterEventsArgs = {
  config: GraphVizConfig;
  graphContainerRef: RefObject<HTMLDivElement>;
  graphState: GraphState;
  onEdgeClick?: (params: {
    edgeId: string;
    screenContainerRef?: RefObject<HTMLDivElement>;
  }) => void;
  onNodeSecondClick?: (params: {
    nodeId: string;
    /**
     * In full-screen mode, only part of the DOM is displayed.
     * This means that MUI components (and any others) that attach to the body will not be visible.
     * If this is provided, components should attach any popups/modals to this ref's current element instead.
     */
    screenContainerRef?: RefObject<HTMLDivElement>;
  }) => void;
  setConfigPanelOpen: (open: boolean) => void;
  setFilterPanelOpen: (open: boolean) => void;
  setGraphState: <K extends keyof GraphState>(
    key: K,
    value: GraphState[K],
  ) => void;
};

/**
 * Register event handlers for the graph.
 */
export const useEventHandlers = ({
  config,
  graphContainerRef,
  graphState,
  onEdgeClick,
  onNodeSecondClick,
  setConfigPanelOpen,
  setFilterPanelOpen,
  setGraphState,
}: RegisterEventsArgs) => {
  const sigma = useSigma();

  const registerEvents = useRegisterEvents();

  const { isFullScreen } = useFullScreen();

  /**
   * Highlight the hovered or selected node and its neighbors up to the configured depth.
   */
  const refreshGraphHighlights = useCallback(() => {
    const highlightedNode =
      graphState.selectedNodeId ?? graphState.hoveredNodeId;

    if (!highlightedNode) {
      return;
    }

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

    setGraphState("highlightedNeighborIds", getNeighbors(highlightedNode));

    sigma.setSetting("renderEdgeLabels", true);

    /**
     * We haven't touched the graph data, so don't need to re-index.
     * An additional optimization would be to supply partialGraph here and only redraw the affected nodes,
     * but since the nodes whose appearance changes are the NON-highlighted nodes (they disappear), it's probably
     * not worth it
     * – they are likely to be the majority anyway, and we'd have to generate an array of them.
     */
    sigma.refresh({ skipIndexation: true });
  }, [config.nodeHighlighting, graphState, setGraphState, sigma]);

  useEffect(() => {
    refreshGraphHighlights();
  }, [refreshGraphHighlights]);

  useEffect(() => {
    const removeHighlights = () => {
      setGraphState("hoveredNodeId", null);
      setGraphState("highlightedNeighborIds", null);

      sigma.setSetting("renderEdgeLabels", false);
      sigma.refresh({ skipIndexation: true });
    };

    registerEvents({
      clickEdge: (event) => {
        onEdgeClick?.({
          edgeId: event.edge,
          screenContainerRef: isFullScreen ? graphContainerRef : undefined,
        });
      },
      clickNode: (event) => {
        if (graphState.selectedNodeId === event.node) {
          /**
           * Only activate the externally-provided onClick when the node is already selected,
           * so that the first click performs the graph highlighting functions.
           *
           * If we want clicks to be registered externally on the first click at some point
           * we can provide a prop which configures this behavior (e.g. nodeClickBehavior)
           */
          onNodeSecondClick?.({
            nodeId: event.node,
            screenContainerRef: isFullScreen ? graphContainerRef : undefined,
          });
          return;
        }

        setGraphState("selectedNodeId", event.node);
        refreshGraphHighlights();
      },
      clickStage: () => {
        /**
         * If we click on the background (the 'stage'), deselect the selected node, and close any open panels.
         */
        if (graphState.selectedNodeId) {
          setGraphState("selectedNodeId", null);
          removeHighlights();
        }

        setConfigPanelOpen(false);
        setFilterPanelOpen(false);
      },
      enterNode: (event) => {
        if (graphState.selectedNodeId) {
          /**
           * If a user has clicked on a node, don't do anything when hovering other over nodes,
           * because it makes it harder to click to highlight neighbors and then browse the highlighted graph.
           * They can click on the background or another node to deselect this one.
           */
          return;
        }

        setGraphState("hoveredNodeId", event.node);
        refreshGraphHighlights();
      },
      leaveNode: () => {
        if (graphState.selectedNodeId) {
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
    graphContainerRef,
    graphState.selectedNodeId,
    isFullScreen,
    onEdgeClick,
    onNodeSecondClick,
    refreshGraphHighlights,
    registerEvents,
    setConfigPanelOpen,
    setFilterPanelOpen,
    setGraphState,
    sigma,
  ]);

  return { refreshGraphHighlights };
};
