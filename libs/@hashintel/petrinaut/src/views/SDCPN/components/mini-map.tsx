import { css } from "@hashintel/ds-helpers/css";
import { use, useMemo } from "react";
import type { MiniMapNodeProps, MiniMapProps } from "reactflow";
import { MiniMap as ReactFlowMiniMap, useStore } from "reactflow";

import { PANEL_MARGIN } from "../../../constants/ui";
import { hexToHsl } from "../../../lib/hsl-color";
import { EditorContext } from "../../../state/editor-context";
import type { NodeType } from "../reactflow-types";

const miniMapClassName = css({
  "& svg": {
    borderRadius: "md.3",
  },
});

/** Default colors for nodes without a type color */
const DEFAULT_PLACE_FILL = "#f8f8f8";
const DEFAULT_PLACE_STROKE = "#666666";
const DEFAULT_TRANSITION_FILL = "#6b7280";

const PLACE_STROKE_WIDTH = 2;

/**
 * Custom node renderer for the MiniMap.
 * Renders place nodes as circles and transition nodes as rectangles.
 */
const MiniMapNode: React.FC<MiniMapNodeProps> = ({
  id,
  x,
  y,
  width,
  height,
}) => {
  const node = useStore(
    (state) => state.nodeInternals.get(id) as NodeType | undefined,
  );

  // Compute colors based on node type and type color
  const { fill, stroke } = useMemo(() => {
    if (node?.data.type === "place") {
      const typeColor = node.data.typeColor;

      if (typeColor) {
        const hsl = hexToHsl(typeColor);
        return {
          fill: hsl.lighten(20).css(0.9),
          stroke: hsl.lighten(-15).saturate(-20).css(1),
        };
      }

      return { fill: DEFAULT_PLACE_FILL, stroke: DEFAULT_PLACE_STROKE };
    }

    // Transitions: solid grey with no stroke
    return { fill: DEFAULT_TRANSITION_FILL, stroke: undefined };
  }, [node?.data]);

  if (node?.data.type === "place") {
    const radius = Math.min(width, height) / 2 - PLACE_STROKE_WIDTH / 2;
    return (
      <circle
        cx={x + width / 2}
        cy={y + height / 2}
        r={Math.max(radius, 1)}
        fill={fill}
        stroke={stroke}
        strokeWidth={PLACE_STROKE_WIDTH}
      />
    );
  }

  return <rect x={x} y={y} width={width} height={height} fill={fill} />;
};

/**
 * A wrapper around ReactFlow's MiniMap with custom styling.
 * Renders place nodes as circles and transition nodes as rectangles.
 * Positions at top-right, offset by properties panel width when visible.
 */
export const MiniMap: React.FC<Omit<MiniMapProps, "style">> = (props) => {
  const { selectedResourceId, propertiesPanelWidth } = use(EditorContext);

  const isPropertiesPanelVisible = selectedResourceId !== null;
  const rightOffset = isPropertiesPanelVisible
    ? propertiesPanelWidth + PANEL_MARGIN * 2
    : PANEL_MARGIN;

  return (
    <ReactFlowMiniMap
      {...props}
      ariaLabel=""
      className={miniMapClassName}
      style={{
        top: 0,
        right: rightOffset,
        bottom: "auto",
        left: "auto",
        width: 130,
        height: 73,
      }}
      maskColor="rgba(0, 0, 0, 0.15)"
      maskStrokeWidth={0}
      nodeComponent={MiniMapNode}
      offsetScale={2}
    />
  );
};
