import { use } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import { ExecutionFrameSourceContext } from "../../react/execution-frame/context";
import { ActualTimeline } from "../views/Editor/panels/BottomPanel/subviews/timeline/actual-timeline";
import { floatingBarStyle } from "./floating-bar-style";

// The width Quick Simulation's playback bar takes once its timeline is expanded.
const timelineSizeStyle = css({
  width: "[calc(100% - 16px)]",
  maxWidth: "[720px]",
  height: "[clamp(60px, 20vh, 116px)]",
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
    <section
      aria-label="Execution timeline"
      className={cx(floatingBarStyle, timelineSizeStyle)}
    >
      <ActualTimeline showLegend={false} />
    </section>
  );
};
