import { memo } from "react";

import { css } from "@hashintel/ds-helpers/css";

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
 * One arc on the page: the element that takes the keyboard focus and the
 * pointer for it, with the name and the classes React Flow gives an edge,
 * and its weight. It paints nothing of the arc's line: the run of the arc
 * draws that.
 *
 * The pointer goes to a path that is not painted: the arc's curve, 20 units
 * wide, as in an edge of React Flow. Where several arcs are within reach the
 * browser takes the last in the document. Nothing that is painted takes the
 * pointer, so a pulse of any width leaves the pane beside its arc pressable.
 * The weight's box is the exception: its border takes the pointer for the
 * arc, as it does in an edge of React Flow.
 */
const ArcItemComponent: React.FC<ArcItemProps> = ({
  shape,
  selectable,
  describedBy,
}) => (
  <g
    // The classes of an edge of React Flow, in the order it writes them.
    className={[
      "arc-item react-flow__edge react-flow__edge-default",
      shape.focus === "none" ? null : "canvas-focus-role",
      "nopan",
      shape.selected ? "selected" : null,
      selectable ? "selectable" : null,
    ]
      .filter(Boolean)
      .join(" ")}
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
      strokeOpacity={0}
      strokeWidth={20}
    />
    {shape.weight > 1 ? <WeightLabel shape={shape} /> : null}
  </g>
);

/**
 * Memoised by hand: the layer renders on every frame of a drag with one
 * element per arc, and the compiler does not skip the items of a list whose
 * parent renders. An arc that draws the same has the same shape object.
 */
export const ArcItem = memo(ArcItemComponent);
