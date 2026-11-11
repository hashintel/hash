/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EventPlaybackContext } from "../../../../../react/event-playback/context";
import {
  DEFAULT_SIMULATION_CONTEXT,
  SimulationContext,
} from "../../../../../react/simulation/context";
import { constantStore } from "../../../../../react/use-store";
import { EventTimeControls } from "./event-time-controls";

import type { EventPlaybackContextValue } from "../../../../../react/event-playback/context";
import type { RunClock } from "@hashintel/petrinaut-core";

afterEach(cleanup);

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
    stepToEvent: () => {},
  }) as unknown as EventPlaybackContextValue;

const renderControls = (clock: RunClock) =>
  render(
    <SimulationContext value={{ ...DEFAULT_SIMULATION_CONTEXT, clock }}>
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
    expect(screen.getByRole("button", { name: "Go to the next step" }));
    expect(screen.getByRole("button", { name: "Go to the previous step" }));
  });
});
