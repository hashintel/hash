import { use, useState } from "react";

import { EventPlaybackContext } from "../../../../../../../react/event-playback/context";
import { MIN_VIEW_SPAN } from "./interactions";

import type { TimeRange } from "./use-event-timeline-data";

/** The span of time a timeline shows, and how it changes. */
export type TimelineViewRange = {
  range: TimeRange;
  /** The time computed so far, which the range never passes. */
  domain: number;
  /** True once the user zoomed or panned; the range then stays where they left it. */
  zoomed: boolean;
  setRange: (range: TimeRange) => void;
  /** Returns to the whole of what is computed, followed as it grows. */
  fit: () => void;
};

export const useTimelineViewRange = (): TimelineViewRange => {
  const { coveredTime } = use(EventPlaybackContext);
  const [zoomedRange, setZoomedRange] = useState<TimeRange | null>(null);
  const domain = Math.max(coveredTime, MIN_VIEW_SPAN);
  return {
    range: zoomedRange ?? { min: 0, max: domain },
    domain,
    zoomed: zoomedRange !== null,
    setRange: setZoomedRange,
    fit: () => setZoomedRange(null),
  };
};
