/**
 * The frame's header: one title line, one line of stats with the compute
 * badge at its right, and the progress bar along the bottom edge. It sits
 * outside the body's scroll container. Once the body has scrolled it
 * condenses: the stats line folds into the title line as compact chips, and
 * the header grows back while the pointer or focus is on it.
 */
import { createContext, use, type ReactNode } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

/** The header's height in pixels at rest: the title line, the stats line and the bar. */
export const FRAME_HEADER_HEIGHT = 56;
/** The header's height in pixels once the body has scrolled: one line and the bar. */
export const FRAME_HEADER_CONDENSED_HEIGHT = 36;

/** How the stats render: with their labels on their own line, or as compact chips beside the title. */
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

const titleStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  lineHeight: "[20px]",
  color: "neutral.s120",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  flexShrink: "1",
  minWidth: "[0]",
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
  flex: "[1]",
  minWidth: "[0]",
  overflow: "hidden",
  whiteSpace: "nowrap",
  "[data-animate=true] &": {
    animationName: "[dialogBackdropIn]",
    animationDuration: "[160ms]",
    animationTimingFunction: "ease-out",
  },
});

const statsRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  height: "[20px]",
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

const badgeSlotStyle = css({
  display: "inline-flex",
  alignItems: "center",
  marginLeft: "auto",
  flexShrink: "0",
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

const statStyle = css({
  display: "inline-flex",
  alignItems: "baseline",
  gap: "1.5",
  minWidth: "[0]",
  flexShrink: "0",
  fontSize: "xs",
  lineHeight: "[16px]",
  color: "neutral.s120",
});

const statLabelStyle = css({
  fontSize: "[10px]",
  fontWeight: "medium",
  letterSpacing: "[0.04em]",
  textTransform: "uppercase",
  color: "neutral.s70",
  "&[data-density=compact]": { display: "none" },
});

const statValueStyle = css({
  display: "inline-flex",
  alignItems: "center",
  fontWeight: "medium",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
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

export type FrameHeaderProps = {
  /** One line, ellipsized when narrow: `SIR transmission sweep · Seasonal Flu · 100 runs · dt 1`. */
  title: string;
  /** Before the title: a Back button in the full view. */
  leading?: ReactNode;
  /** The title line's right side while at rest: a live readout such as the study's progress line. */
  headline?: ReactNode;
  /** The second line: `FrameStat`s and chips. Rendered again as compact chips while condensed. */
  stats: ReactNode;
  /** Pinned to the stats line's right: the compute badge. */
  badge?: ReactNode;
  /** The bar along the bottom edge, 0 to 100. Always drawn. */
  progress: number;
  condensed: boolean;
  /** Whether the height and opacity changes animate: off under reduced motion or the animations setting. */
  animate: boolean;
  /** Room kept clear on the right for a close button the surrounding chrome draws. */
  closeGutter?: number;
  onEngagedChange: (engaged: boolean) => void;
};

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
  onEngagedChange,
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
    onPointerEnter={() => onEngagedChange(true)}
    onPointerLeave={() => onEngagedChange(false)}
    onFocus={() => onEngagedChange(true)}
    onBlur={() => onEngagedChange(false)}
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
            {badge === undefined ? null : (
              <span className={badgeSlotStyle}>{badge}</span>
            )}
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
      {badge === undefined ? null : (
        <span className={badgeSlotStyle}>{badge}</span>
      )}
    </div>
    <div className={progressTrackStyle} data-frame-progress>
      <div
        className={progressFillStyle}
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  </div>
);

/**
 * One stat on the stats line: a small uppercase label and its value. The
 * value reserves `minChars` so a changing number never moves its neighbours.
 * Compact (while the header is condensed) the label becomes a tooltip.
 */
export const FrameStat = ({
  label,
  minChars,
  children,
  className,
}: {
  label: string;
  minChars?: number;
  children: ReactNode;
  className?: string;
}) => {
  const density = use(FrameStatsDensityContext);
  return (
    <span
      className={cx(statStyle, className)}
      data-frame-stat
      title={density === "compact" ? label : undefined}
    >
      <span className={statLabelStyle} data-density={density}>
        {label}
      </span>
      <span
        className={statValueStyle}
        style={
          minChars === undefined ? undefined : { minWidth: `${minChars}ch` }
        }
      >
        {children}
      </span>
    </span>
  );
};

export type FrameStatusTone = "active" | "done" | "error" | "neutral";

/** The status pill: a dot in the status's colour and the status word. */
export const FrameStatusPill = ({
  tone,
  minChars,
  children,
}: {
  tone: FrameStatusTone;
  /** Reserve this many characters so the pill keeps its width across statuses. */
  minChars?: number;
  children: ReactNode;
}) => (
  <span
    className={pillStyle}
    data-tone={tone}
    data-frame-status
    style={minChars === undefined ? undefined : { minWidth: `${minChars}ch` }}
  >
    <span className={pillDotStyle} />
    {children}
  </span>
);
