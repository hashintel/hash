import { BaseEdge, type EdgeProps, getBezierPath } from "@xyflow/react";
import { use } from "react";

import { EditorContext } from "../../../../react/state/editor-context";

import type { WireEdgeType } from "../reactflow-types";

const WIRE_COLOR = "#777";
const WIRE_DASH = "6 3";

const selectionIndicatorStyle = {
  stroke: "rgba(249, 115, 22, 0.4)",
  strokeWidth: 8,
};

export const WireEdge: React.FC<EdgeProps<WireEdgeType>> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}) => {
  const { isSelected } = use(EditorContext);
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      {isSelected(id) && (
        <BaseEdge
          id={`${id}-selection`}
          path={path}
          style={selectionIndicatorStyle}
        />
      )}
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: WIRE_COLOR,
          strokeWidth: 2,
          strokeDasharray: WIRE_DASH,
        }}
      />
    </>
  );
};
