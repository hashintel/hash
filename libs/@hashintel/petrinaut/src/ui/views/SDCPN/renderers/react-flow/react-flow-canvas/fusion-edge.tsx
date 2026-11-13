import { BaseEdge, type EdgeProps, getBezierPath } from "@xyflow/react";

import { css } from "@hashintel/ds-helpers/css";

import { problemColor } from "../../../../../constants/problem-severity";
import { arcHaloColor } from "../../../styles/focus";
import { EdgeUnderlay } from "./shared/edge-underlay";

import type { FusionEdgeType } from "./react-flow-types";

const strokeWidth = 2;
/** Long dashes with wide gaps: a join, not an arc that carries tokens. */
const dashPattern = "7 5";
const fusionColor = "#7c3aed";
const knotRadius = 5;

const labelStyle = css({
  fontSize: "[11px]",
  fontWeight: "medium",
  fill: "[#4c1d95]",
  pointerEvents: "none",
});

const labelBackgroundStyle = css({
  fill: "[white]",
  stroke: "[#ddd6fe]",
  strokeWidth: "[1px]",
});

/**
 * A fusion link: a dashed line between two places that are one place, with a
 * knot at its middle. The line and its knot turn red or amber with the
 * fusion's problems, and the fusion's name takes the knot's place while the
 * fusion is selected or in focus.
 */
export const FusionEdge: React.FC<EdgeProps<FusionEdgeType>> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}) => {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const strokeColor =
    data?.severity === "error" || data?.severity === "warning"
      ? problemColor[data.severity]
      : fusionColor;
  const showName =
    data?.name !== undefined && (selected === true || data.focus !== "none");
  const labelWidth = (data?.name.length ?? 0) * 6.5 + 12;

  return (
    <>
      <g className="arc-strokes">
        <EdgeUnderlay
          id={id}
          path={path}
          selected={selected}
          haloColor={arcHaloColor(data?.focus ?? "none")}
          strokeWidth={strokeWidth}
          strokeDasharray={dashPattern}
          strokeLinecap="round"
        />
        <BaseEdge
          id={id}
          path={path}
          style={{
            stroke: strokeColor,
            strokeWidth,
            strokeDasharray: dashPattern,
            strokeLinecap: "round",
          }}
        />
      </g>
      <g
        transform={`translate(${labelX}, ${labelY})`}
        style={{ pointerEvents: "none" }}
      >
        {showName ? (
          <>
            <rect
              className={labelBackgroundStyle}
              x={-labelWidth / 2}
              y={-10}
              width={labelWidth}
              height={20}
              rx={10}
            />
            <text
              className={labelStyle}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {data.name}
            </text>
          </>
        ) : (
          <circle
            r={knotRadius}
            fill="white"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
          />
        )}
      </g>
    </>
  );
};
