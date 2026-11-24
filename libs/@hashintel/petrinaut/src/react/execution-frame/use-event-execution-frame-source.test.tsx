/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { use, type ReactNode } from "react";
import { afterEach, expect, it } from "vitest";

import {
  createReadableStore,
  type EventPlaybackSnapshot,
} from "@hashintel/petrinaut-core";

import { EventPlaybackContext } from "../event-playback/context";
import {
  DEFAULT_SIMULATION_CONTEXT,
  SimulationContext,
  type SimulationContextValue,
} from "../simulation/context";
import { useEventExecutionFrameSource } from "./use-event-execution-frame-source";

afterEach(cleanup);

const times = [0, 1, 2];
const run = {
  trace: { get: () => ({ eventCount: times.length }) },
  findEventIndexAt: (time: number) =>
    times.findLastIndex((eventTime) => eventTime <= time),
  getEvent: (index: number) =>
    times[index] === undefined ? null : { time: times[index] },
  getEventState: (index: number) => ({ index }),
  getStateAt: () => null,
  findDiscreteEventAtOrBefore: () => null,
  findDiscreteEventAfter: () => null,
} as unknown as SimulationContextValue["eventSimulation"];

it("keeps one function to read frames while playback moves", async () => {
  const playbackStore = createReadableStore<EventPlaybackSnapshot>({
    playState: "Playing",
    time: 0,
    speed: 1,
    mode: "computeBuffer",
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SimulationContext
      value={{ ...DEFAULT_SIMULATION_CONTEXT, eventSimulation: run }}
    >
      <EventPlaybackContext
        value={{
          ...use(EventPlaybackContext),
          eventCount: times.length,
          playbackStore,
        }}
      >
        {children}
      </EventPlaybackContext>
    </SimulationContext>
  );

  const { result } = renderHook(() => useEventExecutionFrameSource(), {
    wrapper: Wrapper,
  });
  const { getFramesInRange } = result.current;

  act(() => playbackStore.set({ ...playbackStore.get(), time: 1 }));
  act(() => playbackStore.set({ ...playbackStore.get(), time: 2 }));

  expect(result.current.currentFrameIndex).toBe(2);
  expect(result.current.totalFrames).toBe(3);
  expect(result.current.getFramesInRange).toBe(getFramesInRange);
  expect(await getFramesInRange(1)).toEqual([{ index: 1 }, { index: 2 }]);
});
