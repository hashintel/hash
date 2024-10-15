import { useTheme } from "@mui/material";
import { useSigma } from "@react-sigma/core";
import { useEffect } from "react";

import { drawRoundRect } from "../../../../../components/grid/utils/draw-round-rect";
import { useFullScreen } from "./full-screen-context";
import type { GraphState } from "./state";

export const labelRenderedSizeThreshold = {
  fullScreen: 12,
  normal: 14,
};

/**
 * See also {@link GraphContainer} for additional settings which aren't expected to change in the graph's lifetime
 */
export const useSetDrawSettings = (graphState: GraphState) => {
  const { palette } = useTheme();
  const sigma = useSigma();

  const { isFullScreen } = useFullScreen();

  useEffect(() => {
    /**
     * Controls what labels will be shown at which zoom levels.
     */
    sigma.setSetting(
      "labelRenderedSizeThreshold",
      labelRenderedSizeThreshold[isFullScreen ? "fullScreen" : "normal"],
    );

    /**
     * Provide a custom renderer for node labels.
     */
    sigma.setSetting(
      "defaultDrawNodeLabel",
      (context: CanvasRenderingContext2D, data, settings) => {
        if (!data.label) {
          return;
        }

        const size = settings.labelSize;
        const font = settings.labelFont;
        const weight = settings.labelWeight;

        context.font = `${weight} ${size}px ${font}`;
        const width = context.measureText(data.label).width + 8;

        const xYWidthHeight = [
          data.x + data.size,
          data.y + size / 3 - 15,
          width,
          20,
        ] as const;

        /**
         * Draw the background for the label
         */
        context.fillStyle = "#ffffffaa";
        context.beginPath();
        drawRoundRect(context, ...xYWidthHeight, 5);
        context.fill();

        /**
         * Draw a border on the background
         */
        context.beginPath();
        drawRoundRect(context, ...xYWidthHeight, 5);
        context.strokeStyle = palette.gray[20];
        context.lineWidth = 1;
        context.stroke();

        /**
         * Draw the label text
         */
        context.fillStyle = palette.gray[80];
        context.fillText(data.label, data.x + data.size + 3, data.y + size / 3);
      },
    );

    /**
     * A 'reducer' in sigma terms – a function to dynamically draw a node.
     * We use it to take account of the graph state (e.g. highlighted nodes).
     */
    sigma.setSetting("nodeReducer", (node, data) => {
      const nodeData = { ...data };

      nodeData.color =
        graphState.colorByNodeTypeId?.[nodeData.nodeTypeId] ?? nodeData.color;

      if (!graphState.selectedNodeId && !graphState.hoveredNodeId) {
        return nodeData;
      }

      if (
        graphState.selectedNodeId !== node &&
        graphState.hoveredNodeId !== node &&
        !graphState.highlightedNeighborIds?.has(node)
      ) {
        if (!graphState.selectedNodeId) {
          /**
           * Nodes are always drawn over edges by the library, so anything other than hiding non-highlighted nodes
           * means that they can obscure the highlighted edges, as is the case here.
           *
           * If they are hidden, it is much more jarring when _hovering_ over nodes because of the rest of the graph
           * fully disappears, so having the 'non-highlighted' nodes remain like this is a UX compromise.
           */
          nodeData.color = "rgba(170, 170, 170, 0.7)";
          nodeData.borderColor = "rgba(170, 170, 170, 0.7)";
          nodeData.label = "";
        } else {
          /**
           * If the user has clicked on a node, we hide everything else.
           */
          nodeData.hidden = true;
        }
      } else {
        nodeData.forceLabel = true;
      }

      if (
        graphState.selectedNodeId === node ||
        graphState.hoveredNodeId === node
      ) {
        nodeData.zIndex = 3;
      }

      return nodeData;
    });

    sigma.setSetting("edgeReducer", (edge, data) => {
      const edgeData = { ...data };

      if (!graphState.selectedNodeId && !graphState.hoveredNodeId) {
        return edgeData;
      }

      /**
       * If we have highlighted nodes, we only draw the edge if both the source and target are highlighted.
       */
      const activeIds = [
        graphState.selectedNodeId,
        graphState.hoveredNodeId,
        ...(graphState.highlightedNeighborIds ?? []),
      ];

      let targetIsShown = false;
      let sourceIsShown = false;

      const graph = sigma.getGraph();
      const source = graph.source(edge);
      const target = graph.target(edge);

      for (const id of activeIds) {
        if (source === id) {
          sourceIsShown = true;
        }
        if (target === id) {
          targetIsShown = true;
        }

        if (sourceIsShown && targetIsShown) {
          break;
        }
      }

      if (sourceIsShown && targetIsShown) {
        edgeData.zIndex = 2;
        edgeData.size = 4;

        const sourceData = graph.getNodeAttributes(source);
        edgeData.color =
          graphState.colorByNodeTypeId?.[sourceData.nodeTypeId] ??
          sourceData.color;

        edgeData.forceLabel = true;
      } else {
        edgeData.hidden = true;
      }

      return edgeData;
    });
  }, [isFullScreen, palette, sigma, graphState]);
};
