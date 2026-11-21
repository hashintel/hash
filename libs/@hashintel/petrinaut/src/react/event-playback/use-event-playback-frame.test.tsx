/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { use, type ReactNode } from "react";
import { afterEach, expect, it } from "vitest";

import { createReadableStore } from "@hashintel/petrinaut-core";

import {
  DEFAULT_SIMULATION_CONTEXT,
  SimulationContext,
  type SimulationContextValue,
} from "../simulation/context";
import { useStore } from "../use-store";
import { EventPlaybackContext } from "./context";
import { useEventPlaybackFrame } from "./use-event-playback-frame";

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
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SimulationContext
      value={{ ...DEFAULT_SIMULATION_CONTEXT, eventSimulation: run }}
    >
      <EventPlaybackContext
        value={{
          ...use(EventPlaybackContext),
          eventCount: useStore(eventCount),
        }}
      >
        {children}
      </EventPlaybackContext>
    </SimulationContext>
  );

  const { result } = renderHook(() => useEventPlaybackFrame(), {
    wrapper: Wrapper,
  });
  expect(result.current.hasNextEvent).toBe(false);

  act(() => {
    times.push(1);
    eventCount.set(times.length);
  });

  expect(result.current.hasNextEvent).toBe(true);
});
