import { useEffect, useRef, useState } from "react";

import { useLatest } from "../../../../../../../../../react/shared/use-latest";

/**
 * Grace period after the pointer or focus leaves the selector before
 * just-hidden entries animate out. Returning within the delay keeps them.
 */
const RELEASE_DELAY_MS = 700;

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

  // The release fires from a timeout, so it reads the hidden set of that
  // moment, not the one of the render that scheduled it.
  const hiddenSeriesRef = useLatest(hiddenSeries);

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
