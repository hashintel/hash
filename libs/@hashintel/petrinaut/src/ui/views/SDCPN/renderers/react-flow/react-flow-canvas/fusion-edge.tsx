import { BaseEdge, type EdgeProps, getBezierPath } from "@xyflow/react";

import { css } from "@hashintel/ds-helpers/css";

import {
  ARC_HALO_OVERHANG,
  ARC_WHITE_OVERHANG,
  arcHaloColor,
} from "../../../styles/focus";

import type { FusionEdgeType } from "./react-flow-types";

const STROKE_WIDTH = 2;
/** Long dashes with wide gaps: a join, not an arc that carries tokens. */
const DASH_PATTERN = "7 5";
const FUSION_COLOR = "#7c3aed";
const ERROR_COLOR = "#dc2626";
const WARNING_COLOR = "#d97706";
const KNOT_RADIUS = 5;

const selectionIndicatorStyle = {
  stroke: "rgba(249, 115, 22, 0.4)",
  strokeWidth: 8,
} as const;

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
 * knot at its middle. The name shows on the knot while the fusion is selected
 * or in focus, and the knot turns red or amber with the fusion's problems.
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
    data?.severity === "error"
      ? ERROR_COLOR
      : data?.severity === "warning"
        ? WARNING_COLOR
        : FUSION_COLOR;
  const haloColor = arcHaloColor(data?.focus ?? "none");
  const showName =
    data?.name !== undefined && (selected === true || data.focus !== "none");
  const labelWidth = (data?.name.length ?? 0) * 6.5 + 12;

  return (
    <>
      <g className="arc-strokes">
        {selected && (
          <BaseEdge
            id={`${id}-selection`}
            path={path}
            style={selectionIndicatorStyle}
          />
        )}
        {haloColor !== undefined && (
          <>
            <path
              d={path}
              fill="none"
              stroke={haloColor}
              strokeWidth={STROKE_WIDTH + ARC_HALO_OVERHANG * 2}
              strokeDasharray={DASH_PATTERN}
              strokeLinecap="round"
              style={{ pointerEvents: "none" }}
            />
            <path
              d={path}
              fill="none"
              stroke="white"
              strokeWidth={STROKE_WIDTH + ARC_WHITE_OVERHANG * 2}
              strokeDasharray={DASH_PATTERN}
              strokeLinecap="round"
              style={{ pointerEvents: "none" }}
            />
          </>
        )}
        <BaseEdge
          id={id}
          path={path}
          style={{
            stroke: strokeColor,
            strokeWidth: STROKE_WIDTH,
            strokeDasharray: DASH_PATTERN,
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
            r={KNOT_RADIUS}
            fill="white"
            stroke={strokeColor}
            strokeWidth={STROKE_WIDTH}
          />
        )}
      </g>
    </>
  );
};
