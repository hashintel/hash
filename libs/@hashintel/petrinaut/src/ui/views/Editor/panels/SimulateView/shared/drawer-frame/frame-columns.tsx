/**
 * The frame body's arrangement. Wide enough, two columns: the parameters
 * and the surface on the left, the metric cards on the right. Narrower, one
 * column with the metric cards first, then the parameters, then the surface,
 * so the thing being watched is at the top either way. Whatever follows
 * (a steps table) spans the width beneath.
 */
import { css } from "@hashintel/ds-helpers/css";

import type { ReactNode } from "react";

/** The body width, in pixels, from which the two-column arrangement applies. */
export const FRAME_TWO_COLUMN_MIN_WIDTH = 1100;

// The body is the `drawer-frame-body` size container (declared in
// drawer-frame.tsx); Panda extracts the query statically, so the threshold is
// written out here and mirrored by the constant above.
const columnsStyle = css({
  display: "grid",
  gap: "4",
  alignItems: "start",
  gridTemplateColumns: "minmax(0, 1fr)",
  gridTemplateAreas: '"secondary" "primary" "after"',
  "@container drawer-frame-body (min-width: 1100px)": {
    gridTemplateColumns: "minmax(0, 3fr) minmax(0, 5fr)",
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
