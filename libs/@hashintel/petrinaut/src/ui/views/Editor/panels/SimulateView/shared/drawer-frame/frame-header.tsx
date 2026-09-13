/**
 * The frame's header: one title line, one strip of labelled stat columns
 * divided by hairlines with the compute badge as its last column, and the
 * progress bar along the bottom edge. It sits outside the body's scroll
 * container. Once the body has scrolled it condenses: the strip folds into
 * the title line as compact chips, and the header grows back while the
 * pointer or focus is on it.
 *
 * Every column is exactly as wide as its widest value: the value cell lays
 * an invisible copy of that widest text under the live one, so a number
 * growing a digit, a status changing word or a count going to zero moves
 * nothing.
 */
import { createContext, use, type ReactNode } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import type { FrameHeaderEngagement } from "./use-header-engaged";

/** The header's height in pixels at rest: the title line, the stat strip and the bar. */
export const FRAME_HEADER_HEIGHT = 68;
/** The header's height in pixels once the body has scrolled: one line and the bar. */
export const FRAME_HEADER_CONDENSED_HEIGHT = 36;

/** How the stats render: as labelled columns on their own line, or as compact chips beside the title. */
export type FrameStatsDensity = "full" | "compact";

const FrameStatsDensityContext = createContext<FrameStatsDensity>("full");

const rootStyle = css({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  flexShrink: "0",
  boxSizing: "border-box",
  minWidth: "[0]",
  overflow: "hidden",
  paddingTop: "1.5",
  paddingLeft: "5",
  paddingRight: "5",
  backgroundColor: "neutral.s00",
  "&[data-animate=true]": {
    transition: "[height 160ms ease-out]",
  },
});

const titleRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  height: "[24px]",
  minWidth: "[0]",
  flexShrink: "0",
});

// The title yields to the compact chips: it may shrink to a few characters,
// the chips never shrink at all.
const titleStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  lineHeight: "[20px]",
  color: "neutral.s120",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  flexShrink: "1",
  minWidth: "[48px]",
});

// The headline reads to the right of the title while the header is at rest;
// condensed, the compact chips take that room and the headline steps aside.
const headlineStyle = css({
  display: "flex",
  alignItems: "center",
  marginLeft: "auto",
  minWidth: "[0]",
  overflow: "hidden",
  "[data-condensed=true] &": { display: "none" },
});

const compactRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  marginLeft: "auto",
  flexShrink: "0",
  whiteSpace: "nowrap",
  "[data-animate=true] &": {
    animationName: "[dialogBackdropIn]",
    animationDuration: "[160ms]",
    animationTimingFunction: "ease-out",
  },
});

// The strip's height is the label line, its gap and the value line; it
// folds to nothing while condensed.
const statsRowStyle = css({
  display: "flex",
  alignItems: "stretch",
  height: "[32px]",
  minWidth: "[0]",
  overflow: "hidden",
  whiteSpace: "nowrap",
  opacity: "[1]",
  "[data-animate=true] &": {
    transition:
      "[height 160ms ease-out, opacity 120ms ease-out, visibility 0s]",
  },
  "[data-condensed=true] &": {
    height: "[0]",
    opacity: "[0]",
    visibility: "hidden",
    transitionDelay: "[0s, 0s, 160ms]",
  },
});

const progressTrackStyle = css({
  position: "absolute",
  left: "[0]",
  right: "[0]",
  bottom: "[0]",
  height: "[3px]",
  backgroundColor: "neutral.s30",
});

const progressFillStyle = css({
  height: "full",
  backgroundColor: "neutral.s120",
  "[data-animate=true] &": {
    transition: "[width 160ms ease-out]",
  },
});

// A column: the label over the value, a hairline on its left from the second
// column on. Compact, the label goes (its text becomes the tooltip) and the
// column is one chip with no rule.
const statStyle = css({
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  flexShrink: "0",
  minWidth: "[0]",
  paddingX: "3",
  fontSize: "xs",
  lineHeight: "[18px]",
  color: "neutral.s120",
  "&[data-density=full]:first-child": { paddingLeft: "[0]" },
  "&[data-density=full] + &[data-density=full]": {
    borderLeftWidth: "[1px]",
    borderLeftStyle: "solid",
    borderLeftColor: "neutral.bd.subtle",
  },
  "&[data-align=end]": { alignItems: "flex-end" },
  "&[data-density=compact]": {
    flexDirection: "row",
    alignItems: "center",
    padding: "[0]",
  },
  "&[data-trailing=true]": { marginLeft: "auto" },
});

const statLabelStyle = css({
  fontSize: "[10px]",
  lineHeight: "[12px]",
  fontWeight: "medium",
  letterSpacing: "[0.04em]",
  textTransform: "uppercase",
  color: "neutral.s70",
  "&[data-density=compact]": { display: "none" },
});

// The live value and the invisible widest value share one grid cell, so the
// cell is as wide as the widest and the live text sits inside it.
const statValueStyle = css({
  display: "grid",
  alignItems: "center",
  fontWeight: "medium",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
  "& > *": { gridArea: "[1 / 1]" },
  "&[data-align=end]": { justifyItems: "end" },
});

const sizerStyle = css({
  visibility: "hidden",
  pointerEvents: "none",
});

const valueTextStyle = css({
  display: "inline-flex",
  alignItems: "center",
  minWidth: "[0]",
});

const pillStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  flexShrink: "0",
  paddingX: "2",
  height: "[18px]",
  borderRadius: "full",
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s110",
  backgroundColor: "neutral.s10",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
  "&[data-tone=active]": { color: "blue.s100", backgroundColor: "blue.s10" },
  "&[data-tone=done]": { color: "green.s100", backgroundColor: "green.s10" },
  "&[data-tone=error]": { color: "red.s100", backgroundColor: "red.s10" },
});

const pillTextStyle = css({
  display: "grid",
  "& > *": { gridArea: "[1 / 1]" },
});

const pillDotStyle = css({
  width: "[6px]",
  height: "[6px]",
  borderRadius: "full",
  flexShrink: "0",
  backgroundColor: "neutral.s60",
  "[data-tone=active] > &": { backgroundColor: "blue.s100" },
  "[data-tone=done] > &": { backgroundColor: "green.s90" },
  "[data-tone=error] > &": { backgroundColor: "red.s100" },
});

/**
 * One column of the strip: a small uppercase label over its value. The
 * column is as wide as `widest`, the longest text the value can be, so a
 * changing value never moves its neighbours. Numbers align to the end.
 * Compact (while the header is condensed) the label becomes a tooltip.
 */
export const FrameStat = ({
  label,
  widest,
  align = "end",
  trailing = false,
  children,
  className,
}: {
  label: string;
  /** The widest text the value can show; it sizes the column invisibly. */
  widest: string;
  /** Where the value sits in its column: numbers at the end, words at the start. */
  align?: "start" | "end";
  /** Pinned to the strip's right edge. */
  trailing?: boolean;
  children: ReactNode;
  className?: string;
}) => {
  const density = use(FrameStatsDensityContext);
  return (
    <span
      className={cx(statStyle, className)}
      data-frame-stat
      data-density={density}
      data-align={align}
      data-trailing={trailing}
      title={density === "compact" ? label : undefined}
    >
      <span className={statLabelStyle} data-density={density}>
        {label}
      </span>
      <span className={statValueStyle} data-align={align}>
        <span className={sizerStyle} aria-hidden data-frame-stat-sizer>
          {widest}
        </span>
        <span className={valueTextStyle} data-frame-stat-value>
          {children}
        </span>
      </span>
    </span>
  );
};

export type FrameStatusTone = "active" | "done" | "error" | "neutral";

/** The status pill: a dot in the status's colour and the status word, as wide as the longest word. */
export const FrameStatusPill = ({
  tone,
  widest,
  children,
}: {
  tone: FrameStatusTone;
  /** The longest status word, so the pill keeps its width across statuses. */
  widest: string;
  children: ReactNode;
}) => (
  <span className={pillStyle} data-tone={tone} data-frame-status>
    <span className={pillDotStyle} />
    <span className={pillTextStyle}>
      <span className={sizerStyle} aria-hidden>
        {widest}
      </span>
      <span>{children}</span>
    </span>
  </span>
);

export type FrameHeaderProps = {
  /** One line, ellipsized when narrow: `SIR transmission sweep · Seasonal Flu · 100 runs · dt 1`. */
  title: string;
  /** Before the title: a Back button in the full view. */
  leading?: ReactNode;
  /** The title line's right side while at rest: a live readout such as the study's progress line. */
  headline?: ReactNode;
  /** The strip: `FrameStat` columns. Rendered again as compact chips while condensed. */
  stats: ReactNode;
  /** The strip's last column, pinned right: the compute badge. */
  badge?: ReactNode;
  /** The bar along the bottom edge, 0 to 100. Always drawn. */
  progress: number;
  condensed: boolean;
  /** Whether the height and opacity changes animate: off under reduced motion or the animations setting. */
  animate: boolean;
  /** Room kept clear on the right for a close button the surrounding chrome draws. */
  closeGutter?: number;
  /** The pointer and focus handlers that hold the header open while the body is scrolled. */
  engagement: FrameHeaderEngagement;
};

const BadgeColumn = ({ badge }: { badge: ReactNode }) => (
  <FrameStat label="Compute" widest="" align="start" trailing>
    {badge}
  </FrameStat>
);

export const FrameHeader = ({
  title,
  leading,
  headline,
  stats,
  badge,
  progress,
  condensed,
  animate,
  closeGutter = 0,
  engagement,
}: FrameHeaderProps) => (
  <div
    className={rootStyle}
    data-frame-header
    data-condensed={condensed}
    data-animate={animate}
    style={{
      height: condensed ? FRAME_HEADER_CONDENSED_HEIGHT : FRAME_HEADER_HEIGHT,
      paddingRight: closeGutter > 0 ? closeGutter : undefined,
    }}
    {...engagement}
  >
    <div className={titleRowStyle}>
      {leading === undefined ? null : leading}
      <span className={titleStyle} data-frame-title>
        {title}
      </span>
      {condensed ? (
        <FrameStatsDensityContext value="compact">
          <div className={compactRowStyle} data-frame-compact-stats>
            {stats}
            {badge === undefined ? null : <BadgeColumn badge={badge} />}
          </div>
        </FrameStatsDensityContext>
      ) : null}
      {headline === undefined ? null : (
        <div className={headlineStyle}>{headline}</div>
      )}
    </div>
    <div
      className={statsRowStyle}
      data-frame-stats
      aria-hidden={condensed ? true : undefined}
    >
      {stats}
      {badge === undefined ? null : <BadgeColumn badge={badge} />}
    </div>
    <div className={progressTrackStyle} data-frame-progress>
      <div
        className={progressFillStyle}
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  </div>
);
