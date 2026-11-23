import { use } from "react";

import { EventPlaybackContext } from "../event-playback/context";
import { useEventPlaybackFrame } from "../event-playback/use-event-playback-frame";
import { SimulationContext } from "../simulation/context";

import type { ExecutionFrameSource } from "./context";
import type { SimulationFrameReader } from "@hashintel/petrinaut-core";

/**
 * Adapter exposing a run's playback as an {@link ExecutionFrameSource}.
 *
 * A "frame" here is a recorded event, so consumers that walk frames by index
 * see the events; the viewed frame is the state at the viewed time, which
 * falls between events as often as on one. Scrubbing to a frame views that
 * event's time.
 */
export const useEventExecutionFrameSource = (): ExecutionFrameSource => {
  const { eventSimulation } = use(SimulationContext);
  const { setTime, eventCount } = use(EventPlaybackContext);
  const { currentEventIndex, currentFrameReader } = useEventPlaybackFrame();

  // One function per run, so a reader that restarts on a new function does
  // not restart on each frame of playback.
  const getFramesInRange = (startIndex: number, endIndex?: number) => {
    const frames: SimulationFrameReader[] = [];
    const total = eventSimulation?.trace.get().eventCount ?? 0;
    const end = endIndex === undefined ? total : Math.min(endIndex, total);
    for (let i = Math.max(0, startIndex); i < end; i++) {
      const frame = eventSimulation?.getEventState(i);
      if (frame) {
        frames.push(frame);
      }
    }
    return Promise.resolve(frames);
  };

  return {
    sourceId: `event-trace:${eventSimulation === null ? "none" : "run"}`,
    // In Stochastic mode, playback counts the experiment's samples instead.
    totalFrames: eventSimulation === null ? 0 : eventCount,
    currentFrameIndex: Math.max(0, currentEventIndex),
    currentFrameReader,
    currentViewedFrame: currentFrameReader?.toFrameState() ?? null,
    scrubToFrame: (frameIndex: number) => {
      const event = eventSimulation?.getEvent(Math.max(0, frameIndex));
      if (event) {
        setTime(event.time);
      }
    },
    getFramesInRange,
  };
};
