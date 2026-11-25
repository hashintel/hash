/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { use, type ReactNode } from "react";
import { afterEach, expect, it } from "vitest";

import {
  createReadableStore,
  type TracePlayerSnapshot,
} from "@hashintel/petrinaut-core";

import { EventPlaybackContext } from "../event-playback/context";
import {
  ExecutionTraceContext,
  NO_VIEWED_EXECUTION,
} from "../execution-trace/context";
import { createQueueTrace } from "../execution-trace/trace.test-helpers";
import { useEventExecutionFrameSource } from "./use-event-execution-frame-source";

afterEach(cleanup);

it("keeps one function to read frames while playback moves", async () => {
  const { trace } = createQueueTrace({ firingTimes: [1, 2], coveredTime: 2 });
  const playbackStore = createReadableStore<TracePlayerSnapshot>({
    playState: "Playing",
    time: 0,
    speed: 1,
    mode: "computeBuffer",
    following: false,
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <ExecutionTraceContext
      value={{ ...NO_VIEWED_EXECUTION, trace, playable: trace }}
    >
      <EventPlaybackContext
        value={{
          ...use(EventPlaybackContext),
          eventCount: trace.coverage.get().eventCount,
          playbackStore,
        }}
      >
        {children}
      </EventPlaybackContext>
    </ExecutionTraceContext>
  );

  const { result } = renderHook(() => useEventExecutionFrameSource(), {
    wrapper: Wrapper,
  });
  const { getFramesInRange } = result.current;

  act(() => playbackStore.set({ ...playbackStore.get(), time: 1 }));
  act(() => playbackStore.set({ ...playbackStore.get(), time: 2 }));

  expect(result.current.currentFrameIndex).toBe(2);
  expect(result.current.totalFrames).toBe(3);
  expect(result.current.currentViewedFrame?.places).toEqual({
    queued: { tokenCount: 1 },
    done: { tokenCount: 2 },
  });
  expect(result.current.getFramesInRange).toBe(getFramesInRange);
  expect(
    (await getFramesInRange(1)).map((frame) =>
      frame.getPlaceTokenCount("done"),
    ),
  ).toEqual([1, 2]);
});
