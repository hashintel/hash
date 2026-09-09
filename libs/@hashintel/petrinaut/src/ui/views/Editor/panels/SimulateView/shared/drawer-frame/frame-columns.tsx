/**
 * The frame body's arrangement under the Parameters band. At the extra-large
 * drawer's width and above, two columns: the surface on the left, the metric
 * cards on the right, the right column never narrower than two cards. In a
 * narrower drawer, one column with the metric cards first, then the surface,
 * so the thing being watched is at the top either way. Without a surface the
 * cards take the whole width. Whatever follows (a steps table) spans the
 * width beneath.
 */
import { css } from "@hashintel/ds-helpers/css";

import type { ReactNode } from "react";

// The body is the `drawer-frame-body` size container (declared in
// drawer-frame.tsx); Panda extracts the query statically, so the threshold
// and the column minimum are written out here. The threshold sits under the
// extra-large drawer's body width (1010px, 995px beside a classic scrollbar)
// with room for a viewport that clamps the drawer a little; the column
// minimum is two chart cards at `CHART_CARD_MIN_WIDTH` and the grid's gap.
const columnsStyle = css({
  display: "grid",
  gap: "4",
  alignItems: "start",
  gridTemplateColumns: "minmax(0, 1fr)",
  gridTemplateAreas: '"secondary" "primary" "after"',
  "@container drawer-frame-body (min-width: 960px)": {
    "&[data-primary=true]": {
      gridTemplateColumns: "minmax(0, 3fr) minmax(656px, 5fr)",
      gridTemplateAreas: '"primary secondary" "after after"',
    },
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
  /** The surface card; absent, the secondary column takes the width. */
  primary?: ReactNode;
  /** The metric cards grid. */
  secondary?: ReactNode;
  /** Full width beneath both columns: a steps table. */
  after?: ReactNode;
}) => (
  <div
    className={columnsStyle}
    data-frame-columns
    data-primary={primary !== undefined}
  >
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
