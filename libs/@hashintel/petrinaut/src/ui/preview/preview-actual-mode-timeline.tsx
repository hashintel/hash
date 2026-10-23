import { use } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { ExecutionFrameSourceContext } from "../../react/execution-frame/context";
import { ActualTimeline } from "../views/Editor/panels/BottomPanel/subviews/simulation-timeline/actual";

// Floats over the canvas where Quick Simulation's playback bar does, at the
// width that bar takes once its timeline is expanded.
const timelinePositionStyle = css({
  position: "absolute",
  left: "[50%]",
  bottom: "2",
  zIndex: "[calc(var(--z-index-sticky) + 1)]",
  transform: "translateX(-50%)",
  width: "[calc(100% - 16px)]",
  maxWidth: "[720px]",
  height: "[clamp(60px, 20vh, 116px)]",
  padding: "0.5",
  overflow: "hidden",
  borderWidth: "thin",
  borderColor: "neutral.s40",
  borderRadius: "lg",
  backgroundColor: "neutral.s00",
});

/**
 * The host's execution as a timeline. The canvas shows the latest frame until
 * the timeline is scrubbed back, and follows again once it's scrubbed to the
 * end.
 */
export const PreviewActualModeTimeline = () => {
  const { totalFrames } = use(ExecutionFrameSourceContext);

  if (totalFrames === 0) {
    return null;
  }

  return (
    <section aria-label="Execution timeline" className={timelinePositionStyle}>
      <ActualTimeline showLegend={false} />
    </section>
  );
};
