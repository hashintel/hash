/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EventPlaybackContext } from "../../../../../react/event-playback/context";
import {
  DEFAULT_SIMULATION_CONTEXT,
  SimulationContext,
} from "../../../../../react/simulation/context";
import { constantStore } from "../../../../../react/use-store";
import { EventTimeControls } from "./event-time-controls";

import type { EventPlaybackContextValue } from "../../../../../react/event-playback/context";
import type { RunClock, RunContinuity } from "@hashintel/petrinaut-core";

afterEach(cleanup);

const stepToEvent = vi.fn<(direction: -1 | 1) => void>();

const playback = (time: number, coveredTime: number) =>
  ({
    coveredTime,
    eventCount: 1,
    playbackStore: constantStore({
      playState: "Paused",
      time,
      speed: 1,
      mode: "computeBuffer",
    }),
    setTime: () => {},
    stepToEvent,
  }) as unknown as EventPlaybackContextValue;

const renderControls = (
  clock: RunClock,
  continuity: RunContinuity = clock === "steps" ? "discrete" : "continuous",
) =>
  render(
    <SimulationContext
      value={{ ...DEFAULT_SIMULATION_CONTEXT, clock, continuity }}
    >
      <EventPlaybackContext value={playback(3.4, 12)}>
        <EventTimeControls disabled={false} />
      </EventPlaybackContext>
    </SimulationContext>,
  );

describe("EventTimeControls", () => {
  it("reads a timed run in seconds, with a scrubber that lands anywhere", () => {
    renderControls("time");

    expect(
      screen.getByRole("timer", {
        name: "Elapsed 3.400 seconds of 12.000 seconds computed",
      }),
    ).toBeTruthy();
    const slider = screen.getByRole("slider", {
      name: "Viewed simulation time",
    });
    expect(slider.getAttribute("step")).toBe("any");
    expect(screen.getByRole("button", { name: "Go to the next event" }));
  });

  it("reads an untimed run in steps, with a scrubber that moves a step at a time", () => {
    renderControls("steps");

    const readout = screen.getByRole("timer", {
      name: "Step 3 of 12 computed",
    });
    expect(readout.textContent).toBe("Step 3of 12");
    const slider = screen.getByRole("slider", { name: "Viewed step" });
    expect(slider.getAttribute("step")).toBe("1");
    // Between two steps the thumb is on the one reached, as the readout is.
    expect((slider as HTMLInputElement).value).toBe("3");
    expect(screen.getByRole("button", { name: "Go to the next step" }));
    expect(screen.getByRole("button", { name: "Go to the previous step" }));
  });

  it("moves the scrubber of a discrete run from event to event with the arrow keys", () => {
    stepToEvent.mockClear();
    renderControls("time", "discrete");
    const slider = screen.getByRole("slider", {
      name: "Viewed simulation time",
    });

    fireEvent.keyDown(slider, { key: "ArrowRight" });
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(stepToEvent.mock.calls).toEqual([[1], [-1]]);
    // The other keys are the range's own: Home and End go to its ends.
    fireEvent.keyDown(slider, { key: "End" });
    expect(stepToEvent).toHaveBeenCalledTimes(2);
  });

  it("leaves the arrow keys of a continuous run to the scrubber", () => {
    stepToEvent.mockClear();
    renderControls("time", "continuous");

    fireEvent.keyDown(
      screen.getByRole("slider", { name: "Viewed simulation time" }),
      { key: "ArrowRight" },
    );
    expect(stepToEvent).not.toHaveBeenCalled();
  });
});
