import { BaseEdge, EdgeProps, getSmoothStepPath } from "reactflow";
import {
  statusToSimpleStatus,
  useStatusForStep,
} from "../shared/flow-runs-context";
import { useMemo } from "react";
import { edgeColor } from "./shared/edge-styles";

/**
 * @todo make custom SVG markers work
 * @see https://reactflow.dev/examples/edges/markers
 */
const _AngleRightRegularMarker = ({ fill }: { fill: string }) => (
  <svg viewBox="0 0 320 512" style={{ position: "absolute", top: 0, right: 0 }}>
    <defs>
      <marker
        id={fill}
        viewBox="0 0 40 40"
        markerHeight={20}
        markerWidth={20}
        refX={20}
        refY={40}
      >
        <path
          stroke={fill}
          d="M273 239c9.4 9.4 9.4 24.6 0 33.9L113 433c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l143-143L79 113c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0L273 239z"
        />
      </marker>
    </defs>
  </svg>
);

export const CustomEdge = ({
  id,
  markerEnd,
  source,
  sourcePosition,
  sourceX,
  sourceY,
  targetPosition,
  targetX,
  targetY,
}: EdgeProps) => {
  const [edgePath] = getSmoothStepPath({
    sourcePosition,
    sourceX,
    sourceY,
    targetPosition,
    targetX: targetX - 8,
    targetY,
    borderRadius: 0,
  });

  const sourceStatus = useStatusForStep(source);

  const { style } = useMemo(() => {
    const color = sourceStatus
      ? edgeColor[statusToSimpleStatus(sourceStatus.status)]
      : edgeColor.Waiting;

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
