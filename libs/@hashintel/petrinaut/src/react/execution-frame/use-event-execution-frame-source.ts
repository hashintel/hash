import { use } from "react";

import { EventPlaybackContext } from "../event-playback/context";
import { useEventPlaybackFrame } from "../event-playback/use-event-playback-frame";
import { ExecutionTraceContext } from "../execution-trace/context";

import type { ExecutionFrameSource } from "./context";
import type { SimulationFrameReader } from "@hashintel/petrinaut-core";

/**
 * Adapter exposing the viewed execution's playback as an
 * {@link ExecutionFrameSource}.
 *
 * A "frame" here is a recorded event, so consumers that walk frames by index
 * see the events; the viewed frame is the state at the viewed position,
 * which falls between events as often as on one. Scrubbing to a frame views
 * that event's position.
 */
export const useEventExecutionFrameSource = (): ExecutionFrameSource => {
  const { origin, trace } = use(ExecutionTraceContext);
  const { setTime, eventCount } = use(EventPlaybackContext);
  const { currentEventIndex, currentFrameReader } = useEventPlaybackFrame();

  // One function per trace, so a reader that restarts on a new function
  // does not restart on each frame of playback.
  const getFramesInRange = (startIndex: number, endIndex?: number) => {
    const frames: SimulationFrameReader[] = [];
    const total = trace?.coverage.get().eventCount ?? 0;
    const end = endIndex === undefined ? total : Math.min(endIndex, total);
    for (let i = Math.max(0, startIndex); i < end; i++) {
      const frame = trace?.getEventState(i);
      if (frame) {
        frames.push(frame);
      }
    }
    return Promise.resolve(frames);
  };

  return {
    sourceId: `execution-trace:${origin}:${trace === null ? "none" : "trace"}`,
    // In Stochastic mode, playback counts the experiment's samples instead.
    totalFrames: trace === null ? 0 : eventCount,
    currentFrameIndex: Math.max(0, currentEventIndex),
    currentFrameReader,
    currentViewedFrame: currentFrameReader?.toFrameState() ?? null,
    scrubToFrame: (frameIndex: number) => {
      const event = trace?.getEvent(Math.max(0, frameIndex));
      if (event) {
        setTime(event.time);
      }
    },
    getFramesInRange,
  };
};
