import { useMemo } from "react";
import type { BaseEdge, EdgeProps, getSmoothStepPath } from "reactflow";

import type { EdgeData } from "../shared/types";

import { edgeColor } from "./shared/edge-styles";

export const CustomEdge = ({
  id,
  data,
  markerEnd,
  sourcePosition,
  sourceX,
  sourceY,
  targetPosition,
  targetX,
  targetY,
}: EdgeProps<EdgeData>) => {
  const [edgePath] = getSmoothStepPath({
    sourcePosition,
    sourceX,
    sourceY,
    targetPosition,
    targetX: targetX - 8,
    targetY,
    borderRadius: 0,
  });

  const { sourceStatus = "Waiting" } = data ?? {};

  const { style } = useMemo(() => {
    const color = edgeColor[sourceStatus];

    return {
      style: {
        stroke: color,
        strokeWidth: 1,
      },
    };
  }, [sourceStatus]);

  return (
    <BaseEdge id={id} markerEnd={markerEnd} path={edgePath} style={style} />
  );
};
