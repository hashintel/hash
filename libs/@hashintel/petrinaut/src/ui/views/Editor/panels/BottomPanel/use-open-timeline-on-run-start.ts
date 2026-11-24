import { useEffect, useRef } from "react";

import { useEditorActions } from "../../../../../react/state/editor-context";

type RunTimeline = "simulation-timeline" | "actual-timeline";

/**
 * Opens the bottom panel on the timeline that has something to draw: a run's
 * or a reported execution's. It acts when `timeline` becomes one of the two,
 * so a tab picked afterwards stays.
 */
export const useOpenTimelineOnRunStart = (timeline: RunTimeline | null) => {
  const { setBottomPanelOpen, setActiveBottomPanelTab } = useEditorActions();
  // Effects run again when the canvas view comes back from hidden, with the
  // same timeline: the ref says it was opened already.
  const openedRef = useRef<RunTimeline | null>(null);

  useEffect(() => {
    if (timeline && timeline !== openedRef.current) {
      setBottomPanelOpen(true);
      setActiveBottomPanelTab(timeline);
    }
    openedRef.current = timeline;
  }, [timeline, setBottomPanelOpen, setActiveBottomPanelTab]);
};
