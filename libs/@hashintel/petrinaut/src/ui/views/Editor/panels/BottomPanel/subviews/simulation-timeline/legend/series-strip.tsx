import { Chip, Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import type { TimelineSeriesMeta } from "../types";
import type { StripLingering } from "./use-strip-lingering";
import type { FC } from "react";

/**
 * How many series the strip renders. The strip is a single clipped line, so
 * rendering hundreds of entries would only add invisible DOM; everything
 * beyond this cap stays reachable through the dropdown.
 */
const STRIP_RENDER_LIMIT = 40;

const stripStyle = css({
  position: "absolute",
  inset: "[0]",
  display: "flex",
  alignItems: "center",
  gap: "2",
  zIndex: "[1]",
  pointerEvents: "none",
});

const stripNamesStyle = css({
  flex: "1",
  minWidth: "[0]",
  overflow: "hidden",
  // Inset by the chip focus ring's width: `overflow` clips at the padding box,
  // so this keeps the first entry's 2px ring inside the clip (it would
  // otherwise be cut off against the strip's left edge). The right edge is a
  // fade, so it needs no equivalent.
  paddingLeft: "[2px]",
  whiteSpace: "nowrap",
  color: "neutral.s100",
  fontSize: "xs",
  fontWeight: "medium",
  lineHeight: "[30px]",
  // No text-overflow ellipsis: the "…" would paint over the partially
  // clipped entry at the edge, whose action button stays hit-testable while
  // invisible. A fade mask keeps the cut-off visible and honest instead.
  maskImage: "[linear-gradient(to right, #000 calc(100% - 28px), transparent)]",
});

const stripItemWrapStyle = css({
  display: "inline-flex",
  alignItems: "center",
  maxWidth: "[240px]",
  minWidth: "[0]",
  overflow: "hidden",
  marginRight: "1",
  verticalAlign: "middle",
  pointerEvents: "auto",
  transition: "[max-width 0.18s ease, margin 0.18s ease, opacity 0.18s ease]",
  // The resting glyph (colour swatch when shown, slashed "hidden" eye when
  // hidden) is visible by default; the action icon stays hidden until the entry
  // is hovered or keyboard-focused, when the two swap.
  "& .stripItemActionIcon": {
    display: "none",
  },
  _hover: {
    "& .stripItemRest": {
      display: "none",
    },
    "& .stripItemActionIcon": {
      display: "inline-block",
    },
  },
  // Only :focus-visible (keyboard), not the plain focus a mouse click leaves on
  // the chip button — otherwise a clicked entry would stay pinned to the action
  // icon after the pointer left instead of settling back to its resting glyph.
  "&:has(:focus-visible)": {
    // Let the focused chip's box-shadow focus ring escape the clip that the
    // leaving-collapse animation otherwise needs (a focused entry never
    // collapses, so nothing spills).
    overflow: "visible",
    "& .stripItemRest": {
      display: "none",
    },
    "& .stripItemActionIcon": {
      display: "inline-block",
    },
  },
});

// Cap the chip width so long series names truncate (via the Chip label's own
// ellipsis) instead of pushing the strip wider.
const stripChipStyle = css({
  maxWidth: "[220px]",
  minWidth: "[0]",
});

const hiddenStripItemStyle = css({
  opacity: 0.45,
  textDecoration: "line-through",
});

/**
 * Collapses a just-hidden entry once the lingering window closes. The CSS
 * transition does the animation; React unmounts the entry on `transitionend`.
 */
const leavingStripItemStyle = css({
  maxWidth: "[0]",
  marginRight: "[0]",
  opacity: 0,
});

// Fixed-size box holding the swatch / eye icon so swapping between them (on
// hover or focus of the entry) never shifts the label.
const stripActionStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: "[16px]",
  height: "[16px]",
  color: "neutral.s110",
});

const stripSwatchStyle = css({
  width: "[8px]",
  height: "[8px]",
  borderRadius: "[2px]",
  flexShrink: 0,
});

const hiddenWhileTypingStyle = css({
  visibility: "hidden",
});

/**
 * The collapsed legend strip rendered inside the selector control.
 *
 * It lists the series currently shown on the chart, in their stable chart
 * order. A shown entry displays its colour swatch, which morphs into a "hide"
 * eye on hover or focus; clicking anywhere on the entry hides the series.
 * Just-hidden entries stay in place — struck through, showing a slashed
 * "hidden" eye that morphs into a "show" eye on hover — until the pointer or
 * focus leaves the whole selector control, so several entries can be toggled
 * — or an accidental click undone — before they animate out of the strip.
 * Hidden series are managed from the dropdown.
 */
export const SeriesStrip: FC<{
  series: TimelineSeriesMeta[];
  hiddenSeries: Set<string>;
  /** Hide the strip while the user is typing a filter into the input. */
  isSearching: boolean;
  lingering: StripLingering;
  onToggleSeries: (seriesId: string) => void;
}> = ({ series, hiddenSeries, isSearching, lingering, onToggleSeries }) => {
  const { lingeringSeriesIds, leavingSeriesIds, holdLingering, finalizeLeave } =
    lingering;

  const stripSeries = series.filter(
    (item) =>
      !hiddenSeries.has(item.seriesId) ||
      lingeringSeriesIds.has(item.seriesId) ||
      leavingSeriesIds.has(item.seriesId),
  );
  // Hidden series and entries beyond the cap aren't listed here — they stay
  // reachable through the dropdown (opened via the strip's count badge).
  const renderedSeries = stripSeries.slice(0, STRIP_RENDER_LIMIT);

  return (
    <span className={cx(stripStyle, isSearching && hiddenWhileTypingStyle)}>
      <span className={stripNamesStyle}>
        {renderedSeries.map((item) => {
          const isVisible = !hiddenSeries.has(item.seriesId);
          const isLeaving = leavingSeriesIds.has(item.seriesId);
          const actionLabel = isVisible
            ? `Hide ${item.seriesName}`
            : `Show ${item.seriesName}`;

          return (
            <span
              key={item.seriesId}
              title={actionLabel}
              className={cx(
                stripItemWrapStyle,
                !isVisible && !isLeaving && hiddenStripItemStyle,
                isLeaving && leavingStripItemStyle,
              )}
              onPointerEnter={() => {
                // Re-entering a leaving entry cancels the exit; the
                // transition simply reverses.
                if (leavingSeriesIds.has(item.seriesId)) {
                  holdLingering(item.seriesId);
                }
              }}
              onTransitionEnd={(event) => {
                if (event.target === event.currentTarget && isLeaving) {
                  finalizeLeave(item.seriesId);
                }
              }}
            >
              <Chip
                size="sm"
                variant="ghost"
                className={stripChipStyle}
                aria-label={actionLabel}
                onClick={() => {
                  holdLingering(item.seriesId);
                  onToggleSeries(item.seriesId);
                }}
                prefix={{
                  variant: "naked",
                  children: (
                    <span className={stripActionStyle}>
                      {isVisible ? (
                        <span
                          className={cx(stripSwatchStyle, "stripItemRest")}
                          style={{ backgroundColor: item.color }}
                        />
                      ) : (
                        <Icon
                          name="eyeSlash"
                          size="xs"
                          className="stripItemRest"
                        />
                      )}
                      <Icon
                        name={isVisible ? "eyeSlash" : "eye"}
                        size="xs"
                        className="stripItemActionIcon"
                      />
                    </span>
                  ),
                }}
              >
                {item.seriesName}
              </Chip>
            </span>
          );
        })}
      </span>
    </span>
  );
};
