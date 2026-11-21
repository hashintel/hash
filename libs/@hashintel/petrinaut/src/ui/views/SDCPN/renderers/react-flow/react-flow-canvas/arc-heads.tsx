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
 *
 * Its shape carries `arc-head`, and `canvas-focus-role` on the head of a
 * role, with the colours the pane's rules for those classes fill it from.
 * The pane fades the head of the arcs with no role as it fades their lines.
 * It gives the head of a role the casing's colour while the canvas has a
 * focus, and the arc's own colour otherwise.
 */
export const ArcHeads: React.FC<{ heads: ArcHead[] }> = ({ heads }) => (
  <svg className={holderStyle} aria-hidden="true">
    <defs>
      {heads.map(({ id, color, haloColor }) => (
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
            className={
              haloColor === undefined
                ? "arc-head"
                : "arc-head canvas-focus-role"
            }
            d={ARC_HEAD_OUTLINE}
            style={{
              // @ts-expect-error CSS variables work at runtime, but are not in the type system
              "--arc-head-color": color,
              "--arc-head-halo": haloColor,
            }}
          />
        </marker>
      ))}
    </defs>
  </svg>
);
