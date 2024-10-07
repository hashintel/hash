import { useTheme } from "@mui/material";
import { useSigma } from "@react-sigma/core";
import { useEffect } from "react";

import { drawRoundRect } from "../../../../../components/grid/utils/draw-round-rect";
import { useFullScreen } from "./full-screen";
import type { GraphState } from "./state";

export const labelRenderedSizeThreshold = {
  fullScreen: 12,
  normal: 14,
};

/**
 * See also {@link GraphContainer} for additional settings
 */
export const useDefaultSettings = (state: GraphState) => {
  const { palette } = useTheme();
  const sigma = useSigma();

  const { isFullScreen } = useFullScreen();

  useEffect(() => {
    sigma.setSetting("labelFont", `"Inter", "Helvetica", "sans-serif"`);
    sigma.setSetting("labelSize", 12);
    sigma.setSetting("labelColor", { color: palette.common.black });
    sigma.setSetting("labelWeight", "400");

    /**
     * Controls how many labels will be rendered in the given visible area.
     * Higher density = more labels
     *
     * Labels are prioritised for display by node size.
     */
    sigma.setSetting("labelDensity", 1);

    /**
     * Edge labels are only shown on hover, controlled in the event handlers.
     */
    sigma.setSetting("edgeLabelColor", { color: "rgba(80, 80, 80, 0.6)" });
    sigma.setSetting("edgeLabelFont", `"Inter", "Helvetica", "sans-serif"`);
    sigma.setSetting("edgeLabelSize", 10);

    /**
     * Controls what labels will be shown at which zoom levels.
     */
    sigma.setSetting(
      "labelRenderedSizeThreshold",
      labelRenderedSizeThreshold[isFullScreen ? "fullScreen" : "normal"],
    );

    sigma.setSetting("zIndex", true);

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

      if (!state.hoveredNodeId || !state.hoveredNeighborIds) {
        return nodeData;
      }

      if (state.hoveredNodeId !== node && !state.hoveredNeighborIds.has(node)) {
        /**
         * Nodes are always drawn over edges by the library, so anything other than hiding non-highlighted nodes
         * means that they can obscure the highlighted edges, as is the case here.
         *
         * If they are hidden, it is much more jarring when hovering over nodes because of the rest of the graph
         * fully disappears, so having the 'non-highlighted' nodes remain like this is a UX compromise.
         */
        nodeData.color = "rgba(170, 170, 170, 0.7)";
        nodeData.borderColor = "rgba(170, 170, 170, 0.7)";
        nodeData.label = "";
      } else {
        nodeData.forceLabel = true;
      }

      return nodeData;
    });

    sigma.setSetting("edgeReducer", (edge, data) => {
      const edgeData = { ...data };

      if (!state.hoveredNodeId || !state.hoveredNeighborIds) {
        return edgeData;
      }

      /**
       * If we have highlighted nodes, we only draw the edge if both the source and target are highlighted.
       */

      const activeIds = [state.hoveredNodeId, ...state.hoveredNeighborIds];

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
        edgeData.forceLabel = true;
      } else {
        edgeData.hidden = true;
      }

      return edgeData;
    });
  }, [isFullScreen, palette, sigma, state]);
};
