import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";
import type { MiniMapNodeProps, MiniMapProps } from "reactflow";
import { MiniMap as ReactFlowMiniMap, useStore } from "reactflow";

import { PANEL_MARGIN } from "../../../constants/ui";
import { hexToHsl } from "../../../lib/hsl-color";
import { EditorContext } from "../../../state/editor-context";
import type { NodeType } from "../reactflow-types";

const miniMapClassName = css({
  backgroundColor: "white.a90",
  borderRadius: "md",
  backdropFilter: "[blur(7px)]",
  "& svg": {
    borderRadius: "md",
  },
});

const SHAPE_SIZE = 90;
const TRANSITION_WIDTH_RATIO = 1.5;
const DEFAULT_PLACE_FILL = "#0F0F0F";
const DEFAULT_TRANSITION_FILL = "#6b7280";

/**
 * Custom node renderer for the MiniMap.
 * Renders place nodes as circles and transition nodes as rectangles.
 */
const MiniMapNode: React.FC<MiniMapNodeProps> = ({ id, x, y }) => {
  // MiniMapNodeProps doesn't include node data, so we look it up from the store
  const node = useStore(
    (state) => state.nodeInternals.get(id) as NodeType | undefined,
  );

  if (!node) {
    return null;
  }

  // Compute colors based on node type and type color
  const fill =
    node.data.type === "place"
      ? node.data.typeColor
        ? hexToHsl(node.data.typeColor).saturation(50).css(1)
        : DEFAULT_PLACE_FILL
      : DEFAULT_TRANSITION_FILL;

  if (node.data.type === "place") {
    return (
      <circle
        cx={x + SHAPE_SIZE / 2}
        cy={y + SHAPE_SIZE / 2}
        r={SHAPE_SIZE / 2}
        fill={fill}
      />
    );
  }

  return (
    <rect
      x={x - SHAPE_SIZE}
      y={y - SHAPE_SIZE / TRANSITION_WIDTH_RATIO}
      width={SHAPE_SIZE * TRANSITION_WIDTH_RATIO}
      height={SHAPE_SIZE}
      fill={fill}
    />
  );
};

/**
 * A wrapper around ReactFlow's MiniMap with custom styling.
 * Renders place nodes as circles and transition nodes as rectangles.
 * Positions at top-right, offset by properties panel width when visible.
 */
export const MiniMap: React.FC<Omit<MiniMapProps, "style">> = (props) => {
  const { selectedResourceId, propertiesPanelWidth, isPanelAnimating } =
    use(EditorContext);

  const isPropertiesPanelVisible = selectedResourceId !== null;
  const minimapOffset = 12;
  const panelOffset = isPropertiesPanelVisible
    ? propertiesPanelWidth + PANEL_MARGIN
    : 0;

  return (
    <ReactFlowMiniMap
      {...props}
      ariaLabel=""
      className={miniMapClassName}
      style={{
        top: minimapOffset,
        right: minimapOffset + panelOffset,
        bottom: "auto",
        left: "auto",
        width: 130,
        height: 73,
        transition: isPanelAnimating ? "right 150ms ease-in-out" : undefined,
      }}
      maskColor="rgba(0, 0, 0, 0.15)"
      maskStrokeWidth={0}
      nodeComponent={MiniMapNode}
      offsetScale={2}
    />
  );
};
