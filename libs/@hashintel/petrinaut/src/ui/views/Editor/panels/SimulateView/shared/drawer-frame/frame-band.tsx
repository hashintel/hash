/**
 * A titled band in the frame body: a title row with an optional help tooltip
 * and a trailing readout, then the band's controls. Bands hold parameter
 * controls and span the body's width; they have no card border. A
 * collapsible band folds its controls away behind a chevron, keeping them
 * mounted so their state survives; the fold animates the band's height
 * alone, and whatever follows the band moves as one block.
 */
import { use, useState, type ReactNode } from "react";

import { Button, HelpTooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { FrameAnimateContext } from "./frame-animate-context";

const bandStyle = css({
  display: "flex",
  flexDirection: "column",
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

// The fold: a one-row grid whose row goes from `1fr` to `0fr`, so the
// content's own height is what animates and the content stays mounted.
const foldStyle = css({
  display: "grid",
  gridTemplateRows: "[1fr]",
  "&[data-animate=true]": {
    transition: "[grid-template-rows 160ms ease-out, visibility 0s]",
  },
  "&[data-collapsed=true]": {
    gridTemplateRows: "[0fr]",
    visibility: "hidden",
    transitionDelay: "[0s, 160ms]",
  },
});

const contentStyle = css({
  minHeight: "[0]",
  minWidth: "[0]",
  overflow: "hidden",
});

const contentInnerStyle = css({
  paddingTop: "2",
});

export const FrameBand = ({
  title,
  help,
  trailing,
  collapsible = false,
  children,
}: {
  title: string;
  help?: string;
  /** The title row's right side: a state line, a switch. */
  trailing?: ReactNode;
  /** A chevron before the title folds the controls away; they stay mounted. */
  collapsible?: boolean;
  children: ReactNode;
}) => {
  const animate = use(FrameAnimateContext);
  const [collapsed, setCollapsed] = useState(false);
  const contentId = `frame-band-${title.replace(/\s+/gu, "-").toLowerCase()}`;

  return (
    <div className={bandStyle} data-frame-band data-collapsed={collapsed}>
      <div className={headerRowStyle}>
        <div className={headerLeftStyle}>
          {collapsible ? (
            <Button
              iconName={collapsed ? "chevronRight" : "chevronDown"}
              variant="ghost"
              size="xs"
              aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
              aria-expanded={!collapsed}
              aria-controls={contentId}
              onClick={() => setCollapsed((previous) => !previous)}
            />
          ) : null}
          <span className={titleStyle}>{title}</span>
          {help === undefined ? null : <HelpTooltip content={help} />}
        </div>
        {trailing === undefined ? null : (
          <div className={trailingStyle}>{trailing}</div>
        )}
      </div>
      <div
        className={foldStyle}
        data-collapsed={collapsed}
        data-animate={animate}
      >
        <div
          id={contentId}
          className={contentStyle}
          data-frame-band-content
          inert={collapsed}
          aria-hidden={collapsed ? true : undefined}
        >
          <div className={contentInnerStyle}>{children}</div>
        </div>
      </div>
    </div>
  );
};
