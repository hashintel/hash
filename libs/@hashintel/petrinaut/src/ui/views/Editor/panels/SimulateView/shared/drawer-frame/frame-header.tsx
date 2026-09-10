/**
 * The frame's header: one title line, one strip of stat columns divided by
 * hairlines with the compute badge as its last column, and the progress bar
 * as its bottom edge. It sits outside the body's scroll container. The strip
 * is always one line. As the header narrows the columns drop their labels
 * and hairlines and read as chips, the label becoming the tooltip; narrower
 * still, a value with a short form shows that instead; whatever still does
 * not fit scrolls sideways under a fade at the edge. Once the body has
 * scrolled the header condenses: the strip folds away, its columns reappear
 * as chips on the title line where the headline was, crossfading with it,
 * and the header grows back while the pointer or focus is on it. The chips
 * are a visual echo of the strip, inert: any pointer or focus on them grows
 * the header back and the strip's own controls take over.
 *
 * Every column is exactly as wide as its widest value: the value cell lays
 * an invisible copy of that widest text under the live one, so a number
 * growing a digit, a status changing word or a count going to zero moves
 * nothing.
 */
import { createContext, type ReactNode, use, useState } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import { Fold } from "./fold";
import { FrameAnimateContext } from "./frame-animate-context";
import { useOverflows } from "./use-overflows";

import type { FrameHeaderEngagement } from "./use-header-engaged";

/** The header's height in pixels at rest with labelled columns: the title line, the gap, the strip and the padding. */
export const FRAME_HEADER_HEIGHT = 74;
/** The header's height in pixels once the body has scrolled: the title line and the padding. */
export const FRAME_HEADER_CONDENSED_HEIGHT = 36;
/**
 * The header content width, in pixels, under which the columns drop their
 * labels and read as chips. Mirrored by the container queries below, which
 * Panda extracts statically.
 */
export const FRAME_HEADER_CHIPS_MAX_WIDTH = 859;
/** The header content width, in pixels, under which a value with a short form shows it. */
export const FRAME_HEADER_SHORT_MAX_WIDTH = 719;

/** How the stats render: as labelled columns on their own line, or as compact chips beside the title. */
export type FrameStatsDensity = "full" | "compact";

const FrameStatsDensityContext = createContext<FrameStatsDensity>("full");

// The header is the size container the strip's tiers read.
const rootStyle = css({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  flexShrink: "0",
  boxSizing: "border-box",
  minWidth: "[0]",
  overflow: "hidden",
  paddingTop: "1.5",
  paddingBottom: "1.5",
  paddingLeft: "5",
  paddingRight: "5",
  backgroundColor: "neutral.s00",
  containerType: "inline-size",
  containerName: "frame-header",
});

const titleRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  height: "[24px]",
  minWidth: "[0]",
  flexShrink: "0",
});

// The title keeps its own width; whatever shares the line with it takes the
// rest and yields inside that, so nothing there moves the title's ellipsis.
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

// The rest of the title line: one grid cell the headline and the compact
// chips share, the headline showing while the header is at rest and the
// chips once it has condensed, crossfading over the strip's fold.
const titleLineEndStyle = css({
  display: "grid",
  alignItems: "center",
  flex: "[1 1 0]",
  minWidth: "[0]",
  "& > *": { gridArea: "[1 / 1]" },
});

const headlineStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  minWidth: "[0]",
  overflow: "hidden",
  opacity: "[1]",
  visibility: "visible",
  "[data-animate=true] &": {
    transition: "[opacity 120ms ease-out, visibility 0s]",
  },
  "[data-condensed=true] &": { opacity: "[0]", visibility: "hidden" },
  "[data-animate=true][data-condensed=true] &": {
    transition: "[opacity 120ms ease-out, visibility 0s 160ms]",
  },
});

// One line of chips that scrolls sideways when its line is too narrow for
// all of them, fading at the edge while there is more to the right: a
// scroll-driven animation from the fade to no mask, inactive while nothing
// overflows. Without scroll-driven animations the chips clip with no fade.
// Only while it overflows is the strip a tab stop, so the keyboard can
// scroll it.
const scrollingLineStyle = css({
  display: "flex",
  alignItems: "center",
  minWidth: "[0]",
  overflowX: "auto",
  overflowY: "hidden",
  scrollbarWidth: "[none]",
  whiteSpace: "nowrap",
  "&::-webkit-scrollbar": { display: "none" },
  "@supports (animation-timeline: scroll())": {
    animationName: "[petrinautScrollEndFade]",
    animationTimeline: "[scroll(self inline)]",
    animationTimingFunction: "linear",
    animationFillMode: "both",
  },
  _focusVisible: {
    outline: "[2px solid {colors.blue.s50}]",
    outlineOffset: "[1px]",
  },
});

const compactRowStyle = css({
  gap: "2",
  height: "[24px]",
  justifySelf: "end",
  maxWidth: "full",
  opacity: "[0]",
  visibility: "hidden",
  "[data-animate=true] &": {
    transition: "[opacity 120ms ease-out, visibility 0s 160ms]",
  },
  "[data-condensed=true] &": { opacity: "[1]", visibility: "visible" },
  "[data-animate=true][data-condensed=true] &": {
    transition: "[opacity 120ms ease-out, visibility 0s]",
  },
});

// The columns on one line, a gap under the title line, fading out as the
// strip folds. Below the chips width the hairlines and their padding go, so
// the chips need a gap.
const statsRowStyle = css({
  alignItems: "stretch",
  paddingTop: "1.5",
  opacity: "[1]",
  "[data-animate=true] &": { transition: "[opacity 120ms ease-out]" },
  "[data-condensed=true] &": { opacity: "[0]" },
  "@container frame-header (max-width: 859px)": {
    columnGap: "2",
  },
});

// The bar is the header's bottom edge: nothing else draws a rule under it.
const progressTrackStyle = css({
  position: "absolute",
  left: "[0]",
  right: "[0]",
  bottom: "[0]",
  height: "[2px]",
  backgroundColor: "neutral.s20",
});

const progressFillStyle = css({
  height: "full",
  backgroundColor: "neutral.s120",
  "[data-animate=true] &": {
    transition: "[width 160ms ease-out]",
  },
});

// A column: the label over the value, a hairline on its left from the second
// column on. As a chip (compact density, or a header under the chips width)
// the label goes, its text becomes the tooltip, and the column is one line
// as tall as the title line with no rule.
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
  // One row of the strip: the label line, its gap and the value line.
  "&[data-density=full]": { height: "[32px]" },
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
    height: "[24px]",
    padding: "[0]",
  },
  "&[data-trailing=true]": { marginLeft: "auto" },
  "@container frame-header (max-width: 859px)": {
    "&[data-density=full]": {
      flexDirection: "row",
      alignItems: "center",
      height: "[24px]",
      padding: "[0]",
    },
    "&[data-density=full] + &[data-density=full]": { borderLeftWidth: "[0]" },
  },
});

const statLabelStyle = css({
  fontSize: "[11px]",
  lineHeight: "[12px]",
  color: "neutral.s80",
  whiteSpace: "nowrap",
  "&[data-density=compact]": { display: "none" },
  "@container frame-header (max-width: 859px)": { display: "none" },
});

// The live value and the invisible widest value share one grid cell, so the
// cell is as wide as the widest and the live text sits inside it. A value
// with a short form lays both forms out and shows one: the short one as a
// chip beside the title, or under the short width; the whole one otherwise.
const valueCellStyle = css({
  display: "grid",
  alignItems: "center",
  fontWeight: "medium",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
  "& > *": { gridArea: "[1 / 1]" },
  "&[data-align=end]": { justifyItems: "end" },
});

const wholeValueStyle = css({
  "[data-short=true][data-density=compact] &": { display: "none" },
  "@container frame-header (max-width: 719px)": {
    "[data-short=true] &": { display: "none" },
  },
});

const shortValueStyle = css({
  display: "none",
  "[data-density=compact] &": { display: "grid" },
  "@container frame-header (max-width: 719px)": { display: "grid" },
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

/** A value's short form for a narrow header, with the widest text it can be. */
export type FrameStatShort = {
  text: string;
  widest: string;
};

/**
 * One column of the strip: a small label over its value. The column is as
 * wide as `widest`, the longest text the value can be, so a changing value
 * never moves its neighbours. Numbers align to the end. As a chip the label
 * becomes the tooltip and `short`, when given, stands in for the value.
 */
export const FrameStat = ({
  label,
  widest,
  short,
  align = "end",
  trailing = false,
  children,
}: {
  label: string;
  /** The widest text the value can show; it sizes the column invisibly. */
  widest: string;
  /** A shorter form of the value for a narrow header; absent, the value shows whole. */
  short?: FrameStatShort;
  /** Where the value sits in its column: numbers at the end, words at the start. */
  align?: "start" | "end";
  /** Pinned to the strip's right edge. */
  trailing?: boolean;
  children: ReactNode;
}) => {
  const density = use(FrameStatsDensityContext);
  return (
    <span
      className={statStyle}
      data-frame-stat
      data-density={density}
      data-align={align}
      data-trailing={trailing}
      data-short={short !== undefined}
      title={label}
    >
      <span className={statLabelStyle} data-density={density}>
        {label}
      </span>
      <span className={cx(valueCellStyle, wholeValueStyle)} data-align={align}>
        <span className={sizerStyle} aria-hidden data-frame-stat-sizer>
          {widest}
        </span>
        <span className={valueTextStyle} data-frame-stat-value>
          {children}
        </span>
      </span>
      {short === undefined ? null : (
        <span
          className={cx(valueCellStyle, shortValueStyle)}
          data-align={align}
        >
          <span className={sizerStyle} aria-hidden>
            {short.widest}
          </span>
          <span className={valueTextStyle} data-frame-stat-short>
            {short.text}
          </span>
        </span>
      )}
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
  /** One line, ellipsized when narrow: `SIR transmission sweep · Seasonal Flu · 100 runs`. */
  title: string;
  /** Before the title: a Back button in the full view. */
  leading?: ReactNode;
  /** The title line's right side while at rest: a live readout such as the study's progress line. */
  headline?: ReactNode;
  /** The strip: `FrameStat` columns. Echoed as inert compact chips on the title line while condensed. */
  stats: ReactNode;
  /** The strip's last column, pinned right: the compute badge. */
  badge?: ReactNode;
  /** The bar along the bottom edge, 0 to 100. Always drawn. */
  progress: number;
  condensed: boolean;
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

/**
 * The chips beside the title while the header is condensed: the strip's
 * columns again at compact density, inert, since any pointer or focus on
 * them grows the header back to the strip.
 */
const CompactStats = ({
  stats,
  badge,
}: Pick<FrameHeaderProps, "stats" | "badge">) => (
  <FrameStatsDensityContext value="compact">
    <div
      className={cx(scrollingLineStyle, compactRowStyle)}
      data-frame-compact-stats
      inert
      aria-hidden
    >
      {stats}
      {badge === undefined ? null : <BadgeColumn badge={badge} />}
    </div>
  </FrameStatsDensityContext>
);

export const FrameHeader = ({
  title,
  leading,
  headline,
  stats,
  badge,
  progress,
  condensed,
  closeGutter = 0,
  engagement,
}: FrameHeaderProps) => {
  const animate = use(FrameAnimateContext);
  const [stripElement, setStripElement] = useState<HTMLDivElement | null>(null);
  const stripOverflows = useOverflows(stripElement);

  return (
    <div
      className={rootStyle}
      data-frame-header
      data-condensed={condensed}
      data-animate={animate}
      style={{ paddingRight: closeGutter > 0 ? closeGutter : undefined }}
      {...engagement}
    >
      <div className={titleRowStyle}>
        {leading === undefined ? null : leading}
        <span className={titleStyle} data-frame-title>
          {title}
        </span>
        <div className={titleLineEndStyle}>
          {headline === undefined ? null : (
            <div
              className={headlineStyle}
              data-frame-headline
              inert={condensed}
              aria-hidden={condensed ? true : undefined}
            >
              {headline}
            </div>
          )}
          <CompactStats stats={stats} badge={badge} />
        </div>
      </div>
      <Fold open={!condensed} data-frame-stats>
        <div
          ref={setStripElement}
          className={cx(scrollingLineStyle, statsRowStyle)}
          data-frame-stats-line
          tabIndex={stripOverflows ? 0 : undefined}
          aria-label="Header statistics"
        >
          {stats}
          {badge === undefined ? null : <BadgeColumn badge={badge} />}
        </div>
      </Fold>
      <div className={progressTrackStyle} data-frame-progress>
        <div
          className={progressFillStyle}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
    </div>
  );
};
