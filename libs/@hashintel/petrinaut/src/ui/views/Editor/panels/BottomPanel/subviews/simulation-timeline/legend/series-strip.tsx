import { useEffect, useRef, useState } from "react";

import { Chip, Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import type { TimelineSeriesMeta } from "../types";
import type { FC } from "react";

/**
 * How many series the strip renders. The strip is a single clipped line, so
 * rendering hundreds of entries would only add invisible DOM; everything
 * beyond this cap stays reachable through the dropdown.
 */
const STRIP_RENDER_LIMIT = 40;

/**
 * Grace period after the pointer or focus leaves the selector before
 * just-hidden entries animate out. Returning within the delay keeps them.
 */
const RELEASE_DELAY_MS = 700;

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

export type StripLingering = {
  /** Series toggled from the strip that stay in place while the pointer or
   * focus remains inside the selector control. */
  lingeringSeriesIds: Set<string>;
  /** Hidden series whose strip entry is animating out before unmounting. */
  leavingSeriesIds: Set<string>;
  /** Keep a series in the strip during the current interaction. */
  holdLingering: (seriesId: string) => void;
  /** Unmount a series entry once its exit transition finished. */
  finalizeLeave: (seriesId: string) => void;
  /**
   * Close the lingering window after {@link RELEASE_DELAY_MS}: hidden
   * lingering entries then animate out.
   */
  scheduleRelease: () => void;
  /** Abort a pending release, e.g. when the pointer returns in time. */
  cancelRelease: () => void;
};

/**
 * Lifecycle for strip entries that were just toggled: they linger in place
 * until the pointer or focus has left the whole selector control for
 * {@link RELEASE_DELAY_MS} (the owner wires
 * {@link StripLingering.scheduleRelease} and
 * {@link StripLingering.cancelRelease} to that boundary), then animate out
 * via {@link StripLingering.leavingSeriesIds}.
 */
export const useStripLingering = (
  hiddenSeries: Set<string>,
): StripLingering => {
  // One state object so the delayed release moves ids between the two sets
  // atomically with a single functional update.
  const [state, setState] = useState<{
    lingering: Set<string>;
    leaving: Set<string>;
  }>({ lingering: new Set(), leaving: new Set() });

  // The release fires from a timeout, so it reads the latest hidden set from
  // a ref instead of the (possibly stale) closed-over prop.
  const hiddenSeriesRef = useRef(hiddenSeries);
  useEffect(() => {
    hiddenSeriesRef.current = hiddenSeries;
  });

  const releaseTimeoutRef = useRef<number | null>(null);

  const cancelRelease = () => {
    if (releaseTimeoutRef.current !== null) {
      window.clearTimeout(releaseTimeoutRef.current);
      releaseTimeoutRef.current = null;
    }
  };

  useEffect(() => cancelRelease, []);

  const holdLingering = (seriesId: string) => {
    cancelRelease();
    setState((prev) => {
      if (prev.lingering.has(seriesId) && !prev.leaving.has(seriesId)) {
        return prev;
      }

      const leaving = new Set(prev.leaving);
      leaving.delete(seriesId);

      return { lingering: new Set(prev.lingering).add(seriesId), leaving };
    });
  };

  const finalizeLeave = (seriesId: string) => {
    setState((prev) => {
      if (!prev.leaving.has(seriesId)) {
        return prev;
      }

      const leaving = new Set(prev.leaving);
      leaving.delete(seriesId);

      return { ...prev, leaving };
    });
  };

  const scheduleRelease = () => {
    if (state.lingering.size === 0) {
      return;
    }

    cancelRelease();
    releaseTimeoutRef.current = window.setTimeout(() => {
      releaseTimeoutRef.current = null;
      setState((prev) => {
        if (prev.lingering.size === 0) {
          return prev;
        }

        const leaving = new Set(prev.leaving);

        for (const seriesId of prev.lingering) {
          if (hiddenSeriesRef.current.has(seriesId)) {
            leaving.add(seriesId);
          }
        }

        return { lingering: new Set(), leaving };
      });
    }, RELEASE_DELAY_MS);
  };

  return {
    lingeringSeriesIds: state.lingering,
    leavingSeriesIds: state.leaving,
    holdLingering,
    finalizeLeave,
    scheduleRelease,
    cancelRelease,
  };
};

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
