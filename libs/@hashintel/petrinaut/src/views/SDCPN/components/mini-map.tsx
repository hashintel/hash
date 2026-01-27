import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";
import type { MiniMapNodeProps, MiniMapProps } from "reactflow";
import { MiniMap as ReactFlowMiniMap, useStore } from "reactflow";

import { PANEL_MARGIN } from "../../../constants/ui";
import { EditorContext } from "../../../state/editor-context";
import type { NodeType } from "../reactflow-types";

const miniMapClassName = css({
  "& svg": {
    borderRadius: 6,
  },
});

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
  color,
}) => {
  // MiniMapNodeProps doesn't include node data, so we look it up from the store
  const node = useStore(
    (state) => state.nodeInternals.get(id) as NodeType | undefined,
  );

  if (node?.data.type === "place") {
    const radius = Math.min(width, height) / 2;
    return (
      <circle cx={x + width / 2} cy={y + height / 2} r={radius} fill={color} />
    );
  }

  return <rect x={x} y={y} width={width} height={height} fill={color} />;
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
      className={miniMapClassName}
      style={{
        top: 0,
        right: rightOffset,
        bottom: "auto",
        left: "auto",
        width: 100,
        height: 64,
      }}
      maskColor="rgba(0, 0, 0, 0.15)"
      maskStrokeWidth={0}
      nodeComponent={MiniMapNode}
      offsetScale={2}
    />
  );
};
