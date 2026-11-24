import { memo } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import { focusRoleClass } from "../../../../styles/focus";

import type { ArcShape } from "./arc-shapes";

const symbolTextStyle = css({
  fontSize: "[13px]",
  fontWeight: "normal",
  fill: "[#999]",
  pointerEvents: "none",
});

const weightTextStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  fill: "[#333]",
  pointerEvents: "none",
});

/** The weight of an arc, on a white box at the middle of its curve. */
const WeightLabel: React.FC<{ shape: ArcShape }> = ({ shape }) => (
  <g
    transform={`translate(${shape.geometry.label.x}, ${shape.geometry.label.y})`}
  >
    <rect
      x="-16"
      y="-10"
      width="32"
      height="20"
      fill="white"
      stroke="#ddd"
      strokeWidth="1"
      rx="3"
    />
    <text
      x="-6"
      y="0"
      textAnchor="middle"
      dominantBaseline="middle"
      className={symbolTextStyle}
    >
      ×
    </text>
    <text
      x="6"
      y="0"
      textAnchor="middle"
      dominantBaseline="middle"
      className={weightTextStyle}
    >
      {shape.weight}
    </text>
  </g>
);

type ArcItemProps = {
  shape: ArcShape;
  /** Whether a click can select the arc: not while a node is being added. */
  selectable: boolean;
  /** The id of React Flow's description of an edge, for a screen reader. */
  describedBy: string;
};

/**
 * One arc on the page: the element that takes the focus and the pointer for
 * it, with the name and the classes React Flow gives an edge, and its weight.
 * Its run paints its line: arc-layer.mdx.
 */
const ArcItemComponent: React.FC<ArcItemProps> = ({
  shape,
  selectable,
  describedBy,
}) => (
  <g
    // The classes of an edge of React Flow, in the order it writes them.
    className={cx(
      "arc-item react-flow__edge react-flow__edge-default",
      shape.focus !== "none" && focusRoleClass,
      "nopan",
      shape.selected && "selected",
      selectable && "selectable",
    )}
    tabIndex={0}
    role="group"
    aria-roledescription="edge"
    aria-label={`Edge from ${shape.sourceId} to ${shape.targetId}`}
    aria-describedby={describedBy}
    data-id={shape.id}
    data-testid={`rf__edge-${shape.id}`}
  >
    <path
      className="react-flow__edge-interaction"
      d={shape.paths.curve}
      fill="none"
      // A paint for a stroke that is never seen. WebKit tests a press
      // against the box of a path first, and counts the width of the stroke
      // into that box only for a stroke that has a paint. Without one, a
      // straight arc along an axis has a box without area and takes no
      // press at all.
      stroke="#000"
      strokeOpacity={0}
      strokeWidth={20}
    />
    {shape.weight > 1 ? <WeightLabel shape={shape} /> : null}
  </g>
);

/** Memoised by hand, as `ArcLayer` says. */
export const ArcItem = memo(ArcItemComponent);
