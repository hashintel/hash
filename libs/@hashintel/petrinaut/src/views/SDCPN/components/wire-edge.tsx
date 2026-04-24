import { BaseEdge, type EdgeProps, getBezierPath } from "@xyflow/react";

import type { WireEdgeType } from "../reactflow-types";

const WIRE_COLOR = "#999";
const WIRE_DASH = "6 3";

/**
 * A dashed edge representing a wire between an external place
 * and a port on a component instance.
 */
export const WireEdge: React.FC<EdgeProps<WireEdgeType>> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
}) => {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      style={{
        stroke: WIRE_COLOR,
        strokeWidth: 2,
        strokeDasharray: WIRE_DASH,
      }}
    />
  );
};
