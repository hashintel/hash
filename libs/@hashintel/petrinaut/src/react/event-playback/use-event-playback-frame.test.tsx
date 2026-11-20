/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { createReadableStore } from "@hashintel/petrinaut-core";

import {
  DEFAULT_SIMULATION_CONTEXT,
  SimulationContext,
  type SimulationContextValue,
} from "../simulation/context";
import { useEventPlaybackFrame } from "./use-event-playback-frame";

import type { ReactNode } from "react";

afterEach(cleanup);

it("sees a firing the run records while the viewed time holds", () => {
  // One run object that grows in place, as the simulation provider holds it.
  const times = [0];
  const eventCount = createReadableStore(times.length);
  const run = {
    findEventIndexAt: (time: number) =>
      times.findLastIndex((eventTime) => eventTime <= time),
    getEvent: (index: number) =>
      times[index] === undefined ? null : { time: times[index] },
    getStateAt: () => null,
    findDiscreteEventAtOrBefore: (index: number) => (index >= 0 ? index : null),
    findDiscreteEventAfter: (index: number) =>
      index + 1 < times.length ? index + 1 : null,
  } as unknown as SimulationContextValue["eventSimulation"];
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SimulationContext
      value={{
        ...DEFAULT_SIMULATION_CONTEXT,
        eventSimulation: run,
        totalFramesStore: eventCount,
      }}
    >
      {children}
    </SimulationContext>
  );

  const { result } = renderHook(() => useEventPlaybackFrame(), { wrapper });
  expect(result.current.hasNextEvent).toBe(false);

  act(() => {
    times.push(1);
    eventCount.set(times.length);
  });

  expect(result.current.hasNextEvent).toBe(true);
});
