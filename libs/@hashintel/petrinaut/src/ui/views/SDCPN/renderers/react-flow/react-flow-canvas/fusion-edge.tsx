import {
  BaseEdge,
  type EdgeProps,
  getBezierPath,
  useInternalNode,
} from "@xyflow/react";

import { css } from "@hashintel/ds-helpers/css";

import { problemStrokeColor } from "../../../../../constants/problem-severity";
import { arcHaloColor } from "../../../styles/focus";
import { fusionLoopPath } from "./fusion-loop-path";
import { LineUnderlay } from "./shared/line-underlay";

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
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}) => {
  const card = useInternalNode(source);
  // Two pins of one card: a curve between them would run under the card.
  const [path, labelX, labelY] =
    card && source === target
      ? fusionLoopPath({
          sourceX,
          sourceY,
          targetX,
          targetY,
          cardTop: card.internals.positionAbsolute.y,
        })
      : getBezierPath({
          sourceX,
          sourceY,
          sourcePosition,
          targetX,
          targetY,
          targetPosition,
        });
  const strokeColor = problemStrokeColor(data?.severity) ?? fusionColor;
  const showName =
    data?.name !== undefined && (selected === true || data.focus !== "none");
  const labelWidth = (data?.name.length ?? 0) * 6.5 + 12;

  return (
    <>
      <LineUnderlay
        path={path}
        selected={selected}
        haloColor={arcHaloColor(data?.focus ?? "none")}
        strokeWidth={strokeWidth}
        strokeDasharray={dashPattern}
        strokeLinecap="round"
      />
      {/*
        A line the pane fades by its stroke, as it does an arc's. Its class
        is its own: the rules for an arc's line also end it short of a head.
      */}
      <BaseEdge
        id={id}
        className="fusion-line"
        path={path}
        style={{
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray: dashPattern,
          strokeLinecap: "round",
        }}
      />
      {/*
        A group the pane fades whole, so that the knot fades with its line:
        its ring lies on its white fill.
      */}
      <g
        className="arc-strokes"
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
