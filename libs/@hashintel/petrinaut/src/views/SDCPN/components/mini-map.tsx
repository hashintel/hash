import { css } from "@hashintel/ds-helpers/css";
import type { MiniMapNodeProps, MiniMapProps } from "reactflow";
import { MiniMap as ReactFlowMiniMap, useStore } from "reactflow";

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
 */
export const MiniMap: React.FC<Omit<MiniMapProps, "style">> = (props) => {
  return (
    <ReactFlowMiniMap
      {...props}
      className={miniMapClassName}
      style={{
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
