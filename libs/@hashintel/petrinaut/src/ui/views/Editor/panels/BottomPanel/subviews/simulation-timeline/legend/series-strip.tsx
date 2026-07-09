import { useComboboxContext } from "@ark-ui/react/combobox";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import type { TimelineSeriesMeta } from "../types";
import type { FC } from "react";

/**
 * How many series the strip renders. Anything beyond this is summarized by
 * the "+N more" chip — the strip is a single clipped line, so rendering
 * hundreds of entries would only add invisible DOM.
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

const stripItemStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  maxWidth: "[240px]",
  minWidth: "[0]",
  overflow: "hidden",
  marginRight: "1",
  paddingX: "1",
  paddingY: "0.5",
  borderRadius: "sm",
  // The surrounding strip uses a 30px line-height to centre the inline row;
  // reset it here so the pill hugs its text instead of growing past the
  // control.
  lineHeight: "[1.2]",
  verticalAlign: "middle",
  pointerEvents: "auto",
  transition:
    "[max-width 0.18s ease, margin 0.18s ease, padding 0.18s ease, opacity 0.18s ease, background-color 0.15s ease]",
  _hover: {
    backgroundColor: "neutral.s30",
    color: "neutral.s125",
    "& .stripItemSwatch": {
      display: "none",
    },
    "& .stripItemActionIcon": {
      display: "inline-flex",
    },
  },
  _focusWithin: {
    backgroundColor: "neutral.s30",
    color: "neutral.s125",
    "& .stripItemSwatch": {
      display: "none",
    },
    "& .stripItemActionIcon": {
      display: "inline-flex",
    },
  },
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
  paddingX: "[0]",
  opacity: 0,
});

const stripActionStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: "[16px]",
  height: "[16px]",
  padding: "[0]",
  border: "[0]",
  borderRadius: "[2px]",
  backgroundColor: "[transparent]",
  color: "neutral.s110",
  cursor: "pointer",
  _hover: {
    color: "neutral.s125",
  },
});

const stripSwatchStyle = css({
  width: "[8px]",
  height: "[8px]",
  borderRadius: "[2px]",
  flexShrink: 0,
});

const stripActionIconStyle = css({
  display: "none",
  alignItems: "center",
  justifyContent: "center",
});

const stripItemTextStyle = css({
  minWidth: "[0]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const moreChipStyle = css({
  display: "inline-flex",
  alignItems: "center",
  flexShrink: 0,
  height: "[20px]",
  paddingX: "1.5",
  border: "[0]",
  borderRadius: "md",
  backgroundColor: "neutral.s20",
  color: "neutral.s105",
  cursor: "pointer",
  fontSize: "[11px]",
  fontWeight: "medium",
  lineHeight: "[1]",
  whiteSpace: "nowrap",
  pointerEvents: "auto",
  _hover: {
    backgroundColor: "neutral.s30",
    color: "neutral.s120",
  },
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
 * order. Hovering an entry morphs its colour swatch into an eye action;
 * clicking that action hides the series. Just-hidden series stay in place
 * (struck through, with the action flipped to "show") until the pointer or
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
  const combobox = useComboboxContext();
  const { lingeringSeriesIds, leavingSeriesIds, holdLingering, finalizeLeave } =
    lingering;

  const stripSeries = series.filter(
    (item) =>
      !hiddenSeries.has(item.seriesId) ||
      lingeringSeriesIds.has(item.seriesId) ||
      leavingSeriesIds.has(item.seriesId),
  );
  const renderedSeries = stripSeries.slice(0, STRIP_RENDER_LIMIT);
  // Everything not rendered here — hidden series and entries beyond the cap —
  // is reachable through the dropdown.
  const overflowCount = series.length - renderedSeries.length;

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
              className={cx(
                stripItemStyle,
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
              <button
                type="button"
                aria-label={actionLabel}
                title={actionLabel}
                className={stripActionStyle}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  holdLingering(item.seriesId);
                  onToggleSeries(item.seriesId);
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
              >
                <span
                  className={cx(stripSwatchStyle, "stripItemSwatch")}
                  style={{ backgroundColor: item.color }}
                />
                <span
                  className={cx(stripActionIconStyle, "stripItemActionIcon")}
                >
                  <Icon name={isVisible ? "eyeSlash" : "eye"} size="xs" />
                </span>
              </button>
              <span className={stripItemTextStyle}>{item.seriesName}</span>
            </span>
          );
        })}
      </span>
      {overflowCount > 0 && (
        <button
          type="button"
          className={moreChipStyle}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            combobox.setOpen(true);
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
        >
          +{overflowCount} more
        </button>
      )}
    </span>
  );
};
