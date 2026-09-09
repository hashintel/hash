/**
 * A titled band in the frame body: a title row with an optional help tooltip
 * and a trailing readout, then the band's controls. Bands hold parameter
 * controls; they have no card border and no collapse.
 */
import { HelpTooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { ReactNode } from "react";

const bandStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  minWidth: "[0]",
});

// The row is one line at a fixed height: whatever the trailing readout says,
// the controls below it never move.
const headerRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  height: "[24px]",
});

const headerLeftStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  flexShrink: "0",
});

const titleStyle = css({
  fontWeight: "semibold",
  fontSize: "sm",
  lineHeight: "[20px]",
  color: "neutral.fg.body",
});

const trailingStyle = css({
  display: "flex",
  alignItems: "center",
  minWidth: "[0]",
  overflow: "hidden",
  whiteSpace: "nowrap",
});

export const FrameBand = ({
  title,
  help,
  trailing,
  children,
}: {
  title: string;
  help?: string;
  /** The title row's right side: a state line, a switch. */
  trailing?: ReactNode;
  children: ReactNode;
}) => (
  <div className={bandStyle} data-frame-band>
    <div className={headerRowStyle}>
      <div className={headerLeftStyle}>
        <span className={titleStyle}>{title}</span>
        {help === undefined ? null : <HelpTooltip content={help} />}
      </div>
      {trailing === undefined ? null : (
        <div className={trailingStyle}>{trailing}</div>
      )}
    </div>
    {children}
  </div>
);
