/**
 * Pointer capture on a plot's cursor layer: pressing picks the frame under
 * the pointer, and dragging scrubs across frames.
 */
import type { MetricFrame } from "../shared/metric-frames";
import type { PointerPosition } from "../shared/pointer-position";
import type uPlot from "uplot";

export type FramePick = {
  /** The frame's position in the plotted frames. */
  index: number;
  frame: MetricFrame;
  pointer: PointerPosition;
};

/** Returns the teardown. `getFrames` is read at pointer time. */
export const attachFrameScrubbing = (
  plot: uPlot,
  getFrames: () => readonly MetricFrame[],
  onPick: (pick: FramePick) => void,
): (() => void) => {
  let dragging = false;

  const pickAt = (event: PointerEvent) => {
    const overRect = plot.over.getBoundingClientRect();
    const x = Math.min(
      Math.max(event.clientX - overRect.left, 0),
      overRect.width,
    );
    const index = plot.posToIdx(x, false);
    const frame = getFrames()[index];
    if (frame) {
      onPick({
        index,
        frame,
        pointer: { clientX: event.clientX, clientY: event.clientY },
      });
    }
  };
  const handlePointerDown = (event: PointerEvent) => {
    dragging = true;
    plot.over.setPointerCapture(event.pointerId);
    pickAt(event);
  };
  const handlePointerMove = (event: PointerEvent) => {
    if (dragging) {
      pickAt(event);
    }
  };
  const handlePointerUp = (event: PointerEvent) => {
    if (!dragging) {
      return;
    }
    dragging = false;
    if (plot.over.hasPointerCapture(event.pointerId)) {
      plot.over.releasePointerCapture(event.pointerId);
    }
  };

  plot.over.addEventListener("pointerdown", handlePointerDown);
  plot.over.addEventListener("pointermove", handlePointerMove);
  plot.over.addEventListener("pointerup", handlePointerUp);
  plot.over.addEventListener("pointercancel", handlePointerUp);
  return () => {
    plot.over.removeEventListener("pointerdown", handlePointerDown);
    plot.over.removeEventListener("pointermove", handlePointerMove);
    plot.over.removeEventListener("pointerup", handlePointerUp);
    plot.over.removeEventListener("pointercancel", handlePointerUp);
  };
};
