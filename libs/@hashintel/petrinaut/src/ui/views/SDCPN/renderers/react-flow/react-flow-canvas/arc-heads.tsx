import { css } from "@hashintel/ds-helpers/css";

import { ARC_HEAD_OUTLINE, type ArcHead } from "./arc-head";

// The markers draw where an arc points at them. Their holder takes no room
// and no pointer.
const holderStyle = css({
  position: "absolute",
  width: "[0]",
  height: "[0]",
  pointerEvents: "none",
});

/**
 * The arrowheads the standard arcs point at. A head scales with the stroke
 * of its arc and turns with the arc's end, as React Flow's own markers do.
 * Its shape carries `arc-head`, and `canvas-focus-role` on the heads of the
 * arcs in focus, so the pane fades a head as it fades the node or the line
 * that has no role.
 */
export const ArcHeads: React.FC<{ heads: ArcHead[] }> = ({ heads }) => (
  <svg className={holderStyle} aria-hidden="true">
    <defs>
      {heads.map(({ id, color, inFocus }) => (
        <marker
          key={id}
          id={id}
          viewBox="-10 -10 20 20"
          markerWidth="20"
          markerHeight="20"
          refX="0"
          refY="0"
          orient="auto-start-reverse"
          markerUnits="strokeWidth"
        >
          <path
            className={inFocus ? "arc-head canvas-focus-role" : "arc-head"}
            d={ARC_HEAD_OUTLINE}
            style={{ fill: color }}
          />
        </marker>
      ))}
    </defs>
  </svg>
);
