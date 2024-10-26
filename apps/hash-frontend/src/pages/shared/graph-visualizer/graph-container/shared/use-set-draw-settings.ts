import { useTheme } from "@mui/material";
import { useSigma } from "@react-sigma/core";
import { useEffect } from "react";

import { drawRoundRect } from "../../../../../components/grid/utils/draw-round-rect";
import type {
  DynamicNodeSizing,
  GraphVizConfig,
  StaticNodeSizing,
} from "./config-control";
import { useFullScreen } from "./full-screen-context";
import type { GraphState } from "./state";

export const labelRenderedSizeThreshold = {
  fullScreen: 12,
  normal: 14,
};

const maxLabelWidth = 100;

const getCanvasLines = (ctx: CanvasRenderingContext2D, text: string) => {
  const words = text.split(" ");
  const lines = [];
  let currentLine = words[0]!;
  let maxLineWidth = 0;

  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    const width = ctx.measureText(`${currentLine} ${word}`).width;
    if (width < maxLabelWidth) {
      currentLine += ` ${word}`;
    } else {
      maxLineWidth = Math.max(maxLineWidth, ctx.measureText(currentLine).width);
      lines.push(currentLine);
      currentLine = word;
    }
  }

  maxLineWidth = Math.max(maxLineWidth, ctx.measureText(currentLine).width);
  lines.push(currentLine);

  return { lines, maxLineWidth };
};

const getRgb = (cssString: string): [number, number, number] | null => {
  // Check if it's in the hex format (#RRGGBB or shorthand #RGB)
  let hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(cssString);
  if (hexMatch) {
    return [
      parseInt(hexMatch[1]!, 16),
      parseInt(hexMatch[2]!, 16),
      parseInt(hexMatch[3]!, 16),
    ];
  }

  // Check if it's in the shorthand hex format (#RGB)
  hexMatch = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(cssString);
  if (hexMatch) {
    return [
      parseInt(hexMatch[1]! + hexMatch[1]!, 16),
      parseInt(hexMatch[2]! + hexMatch[2]!, 16),
      parseInt(hexMatch[3]! + hexMatch[3]!, 16),
    ];
  }

  // Check if it's in the rgb format (rgb(0, 0, 0))
  const rgbMatch = /^rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)$/;
  const match = rgbMatch.exec(cssString);
  if (match) {
    return [
      parseInt(match[1]!, 10),
      parseInt(match[2]!, 10),
      parseInt(match[3]!, 10),
    ];
  }

  return null;
};

const lightenColor = (color: string) => {
  const rgb = getRgb(color);

  if (!rgb) {
    return color;
  }

  const lightened = rgb.map((value) => Math.floor(value + (255 - value) * 0.6));

  const lightenedColorString = `rgba(${lightened.join(", ")}, 1)`;

  return lightenedColorString;
};

/**
 * See also {@link GraphContainer} for additional settings which aren't expected to change in the graph's lifetime
 */
export const useSetDrawSettings = <
  NodeSizing extends StaticNodeSizing | DynamicNodeSizing,
>(
  graphState: GraphState,
  config: GraphVizConfig<NodeSizing>,
) => {
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

        /**
         * @todo draw the label in multiple lines if it's too long, using the getCanvasLines function above
         */

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

      if (
        !graphState.selectedNodeId &&
        !graphState.hoveredNodeId &&
        !graphState.highlightedEdgePath
      ) {
        if (graphState.hoveredEdgeId) {
          const graph = sigma.getGraph();
          const source = graph.source(graphState.hoveredEdgeId);
          const target = graph.target(graphState.hoveredEdgeId);
          if (source === node || target === node) {
            nodeData.zIndex = 5;
            nodeData.forceLabel = true;
          }
        }

        return nodeData;
      }

      let allHighlightedNodes: Set<string | null>;
      if (graphState.highlightedEdgePath) {
        const graph = sigma.getGraph();
        try {
          allHighlightedNodes = new Set(
            graphState.highlightedEdgePath.flatMap((edgeId) => {
              const source = graph.source(edgeId);
              const target = graph.target(edgeId);
              return [source, target];
            }),
          );
        } catch {
          /**
           * Setting the edge size/scale while there's a highlightedEdgePath causes a crash due to source/target of edges not being found
           * @todo fix it so that this doesn't happen
           */
          // eslint-disable-next-line no-param-reassign
          graphState.highlightedEdgePath = null;
          return nodeData;
        }
      } else {
        allHighlightedNodes = new Set([
          graphState.selectedNodeId,
          graphState.hoveredNodeId,
          ...(graphState.neighborsByDepth ?? []).flatMap((set) => [...set]),
        ]);
      }

      if (!allHighlightedNodes.has(node)) {
        if (!graphState.selectedNodeId && !graphState.highlightedEdgePath) {
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
           * If the user has clicked on a node or highlighted a path, we hide everything else.
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
        nodeData.label = `${nodeData.label} (${nodeData.significance})`;
      }

      return nodeData;
    });

    sigma.setSetting("edgeReducer", (edge, data) => {
      const edgeData = { ...data };

      const graph = sigma.getGraph();
      const source = graph.source(edge);
      const sourceData = graph.getNodeAttributes(source);

      const sourceColor =
        graphState.colorByNodeTypeId?.[sourceData.nodeTypeId] ??
        sourceData.color;

      edgeData.color = lightenColor(sourceColor);

      if (edge === graphState.hoveredEdgeId) {
        /**
         * Set a minimum size on hover so it's easier to distinguish and click on
         */
        edgeData.size = Math.max(edgeData.size, 8);
      }

      if (edge === graphState.hoveredEdgeId || graphState.highlightedEdgePath) {
        /**
         * Show the edge's significance if it is hovered or if it is part of a highlighted path
         */
        edgeData.forceLabel = true;
        edgeData.label = `(${edgeData.significance})`;
      }

      const selectedNode =
        graphState.selectedNodeId ?? graphState.hoveredNodeId;

      if (!selectedNode && !graphState.highlightedEdgePath) {
        if (
          edgeData.size < config.edgeSizing.nonHighlightedVisibleSizeThreshold
        ) {
          /**
           * If we don't have any node hovered, clicked or any edge highlighted,
           * hide the edge if it's below the threshold size
           */
          edgeData.hidden = true;
          return edgeData;
        }

        return edgeData;
      }

      const target = graph.target(edge);

      let showEdge: boolean = false;
      if (graphState.highlightedEdgePath) {
        if (graphState.highlightedEdgePath.includes(edge)) {
          showEdge = true;
        }
      } else {
        /**
         * If we have highlighted nodes, we only draw the edge if both the source and target are highlighted.
         */
        const allHighlightedNodes = new Set([
          selectedNode,
          ...(graphState.neighborsByDepth ?? []).flatMap((set) => [...set]),
        ]);

        let targetIsShown = false;
        let sourceIsShown = false;

        for (const nodeId of allHighlightedNodes) {
          if (source === nodeId) {
            sourceIsShown = true;
          }
          if (target === nodeId) {
            targetIsShown = true;
          }

          if (sourceIsShown && targetIsShown) {
            break;
          }
        }

        /**
         * We don't want to highlight edges between nodes which happen to be connected but via an edge
         * that would not have been followed for the configured traversal depth.
         * In practice this means ignoring edges from or to the nodes where the traversal ended (depending on traversal
         * direction).
         */
        const nodesTraversalPassesThrough = new Set([
          selectedNode,
          ...(graphState.neighborsByDepth ?? [])
            /**
             * neighborsByDepth is zero-based, e.g. the neighbors at depth 1 are at array position 0
             */
            .slice(0, config.nodeHighlighting.depth - 1)
            .flatMap((set) => [...set]),
        ]);

        let edgeWasFollowedInTraversal = false;
        switch (config.nodeHighlighting.direction) {
          case "All": {
            edgeWasFollowedInTraversal =
              nodesTraversalPassesThrough.has(source) ||
              nodesTraversalPassesThrough.has(target);
            break;
          }
          case "In": {
            edgeWasFollowedInTraversal =
              nodesTraversalPassesThrough.has(target);
            break;
          }
          case "Out": {
            edgeWasFollowedInTraversal =
              nodesTraversalPassesThrough.has(source);
            break;
          }
        }

        showEdge = sourceIsShown && targetIsShown && edgeWasFollowedInTraversal;
      }

      if (showEdge) {
        edgeData.zIndex = Math.max(edgeData.size, 4);
      } else {
        edgeData.hidden = true;
      }

      return edgeData;
    });
  }, [
    config.nodeHighlighting,
    config.edgeSizing.nonHighlightedVisibleSizeThreshold,
    isFullScreen,
    palette,
    sigma,
    graphState,
  ]);
};
