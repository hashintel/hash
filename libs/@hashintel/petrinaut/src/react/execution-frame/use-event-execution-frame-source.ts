import { use } from "react";

import { EventPlaybackContext } from "../event-playback/context";
import { useEventPlaybackFrame } from "../event-playback/use-event-playback-frame";
import { SimulationContext } from "../simulation/context";
import { useStore } from "../use-store";

import type { ExecutionFrameSource } from "./context";

/**
 * Adapter exposing a run's playback as an {@link ExecutionFrameSource}.
 *
 * A "frame" here is a recorded event, so consumers that walk frames by index
 * see the events; the viewed frame is the state at the viewed time, which
 * falls between events as often as on one. Scrubbing to a frame views that
 * event's time.
 */
export const useEventExecutionFrameSource = (): ExecutionFrameSource => {
  const { eventSimulation, getFramesInRange, totalFramesStore } =
    use(SimulationContext);
  const totalFrames = useStore(totalFramesStore);
  const { setTime } = use(EventPlaybackContext);
  const { currentEventIndex, currentFrameReader } = useEventPlaybackFrame();

  return {
    sourceId: `event-trace:${eventSimulation === null ? "none" : "run"}`,
    totalFrames,
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
