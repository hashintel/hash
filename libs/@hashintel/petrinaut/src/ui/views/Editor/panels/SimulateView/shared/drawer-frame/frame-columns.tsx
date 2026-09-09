/**
 * The frame body's arrangement. At the extra-large drawer's width and above,
 * two columns: the parameters and the surface on the left, the metric cards
 * on the right, the right column never narrower than two cards. In a
 * narrower drawer, one column with the metric cards first, then the
 * parameters, then the surface, so the thing being watched is at the top
 * either way. Whatever follows (a steps table) spans the width beneath.
 */
import { css } from "@hashintel/ds-helpers/css";

import type { ReactNode } from "react";

/**
 * The body width, in pixels, from which the two-column arrangement applies.
 * The extra-large ds drawer is 1060px wide and its body's content box 1010px,
 * 995px beside a classic scrollbar; the threshold sits under that with room
 * for a viewport that clamps the drawer a little.
 */
export const FRAME_TWO_COLUMN_MIN_WIDTH = 960;

/**
 * The secondary column's minimum width in pixels: two chart cards at
 * `CHART_CARD_MIN_WIDTH` and the grid's 12px gap between them. The primary
 * column yields until the body is wide enough for the 3:5 split.
 */
export const FRAME_SECONDARY_MIN_WIDTH = 652;

// The body is the `drawer-frame-body` size container (declared in
// drawer-frame.tsx); Panda extracts the query statically, so the threshold
// and the column minimum are written out here and mirrored by the constants
// above.
const columnsStyle = css({
  display: "grid",
  gap: "4",
  alignItems: "start",
  gridTemplateColumns: "minmax(0, 1fr)",
  gridTemplateAreas: '"secondary" "primary" "after"',
  "@container drawer-frame-body (min-width: 960px)": {
    gridTemplateColumns: "minmax(0, 3fr) minmax(652px, 5fr)",
    gridTemplateAreas: '"primary secondary" "after after"',
  },
});

const areaStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "4",
  minWidth: "[0]",
});

export const FrameColumns = ({
  primary,
  secondary,
  after,
}: {
  /** The parameters band, then the surface card. */
  primary?: ReactNode;
  /** The metric cards grid. */
  secondary?: ReactNode;
  /** Full width beneath both columns: a steps table. */
  after?: ReactNode;
}) => (
  <div className={columnsStyle} data-frame-columns>
    {primary === undefined ? null : (
      <div className={areaStyle} style={{ gridArea: "primary" }}>
        {primary}
      </div>
    )}
    {secondary === undefined ? null : (
      <div className={areaStyle} style={{ gridArea: "secondary" }}>
        {secondary}
      </div>
    )}
    {after === undefined ? null : (
      <div className={areaStyle} style={{ gridArea: "after" }}>
        {after}
      </div>
    )}
  </div>
);
