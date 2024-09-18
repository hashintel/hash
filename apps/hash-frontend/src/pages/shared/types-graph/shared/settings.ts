import { useTheme } from "@mui/material";
import { useSigma } from "@react-sigma/core";
import { useEffect } from "react";

import type { GraphState } from "./state";
import { useFullScreen } from "./full-screen";

export const labelRenderedSizeThreshold = {
  fullScreen: 14,
  normal: 16,
};

export const useDefaultSettings = (state: GraphState) => {
  const { palette } = useTheme();
  const sigma = useSigma();

  const { isFullScreen } = useFullScreen();

  useEffect(() => {
    sigma.setSetting("labelFont", `"Inter", "Helvetica", "sans-serif"`);
    sigma.setSetting("labelSize", 13);
    sigma.setSetting("labelColor", { color: palette.common.black });
    sigma.setSetting("labelWeight", "400");

    /**
     * Controls how many labels will be rendered in the given visible area.
     * Higher density = more labels
     *
     * Labels are prioritised for display by node size.
     */
    sigma.setSetting("labelDensity", 50);

    /**
     * Controls what labels will be shown at which zoom levels.
     */
    sigma.setSetting(
      "labelRenderedSizeThreshold",
      labelRenderedSizeThreshold[isFullScreen ? "fullScreen" : "normal"],
    );

    sigma.setSetting("zIndex", true);

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

        context.fillStyle = "#ffffffcc";
        context.fillRect(data.x + data.size, data.y + size / 3 - 15, width, 20);

        context.fillStyle = "#000";
        context.fillText(data.label, data.x + data.size + 3, data.y + size / 3);
      },
    );

    sigma.setSetting("nodeReducer", (node, data) => {
      const nodeData = { ...data };

      if (!state.hoveredNodeId || !state.hoveredNeighborIds) {
        return nodeData;
      }

      if (state.hoveredNodeId !== node && !state.hoveredNeighborIds.has(node)) {
        nodeData.color = palette.gray[10];
        nodeData.label = "";
        nodeData.zIndex = 1;
      } else {
        nodeData.forceLabel = true;
        nodeData.zIndex = 2;
      }

      return nodeData;
    });

    sigma.setSetting("edgeReducer", (edge, data) => {
      const edgeData = { ...data };

      if (!state.hoveredNodeId || !state.hoveredNeighborIds) {
        return edgeData;
      }

      const activeIds = [...state.hoveredNodeId, ...state.hoveredNeighborIds];

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

      edgeData.hidden = !(sourceIsShown && targetIsShown);
      edgeData.zIndex = 2;

      return edgeData;
    });
  }, [isFullScreen, palette, sigma, state]);
};
