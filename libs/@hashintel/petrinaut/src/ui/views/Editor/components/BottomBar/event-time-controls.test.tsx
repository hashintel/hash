/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EventPlaybackContext } from "../../../../../react/event-playback/context";
import {
  ExecutionTraceContext,
  NO_VIEWED_EXECUTION,
} from "../../../../../react/execution-trace/context";
import { createQueueTrace } from "../../../../../react/execution-trace/trace.test-helpers";
import { constantStore } from "../../../../../react/shared/use-store";
import { EventTimeControls } from "./event-time-controls";

import type { EventPlaybackContextValue } from "../../../../../react/event-playback/context";
import type {
  ExecutionTrace,
  RunClock,
  RunContinuity,
} from "@hashintel/petrinaut-core";

const stepToEvent = vi.fn<(direction: -1 | 1) => void>();

afterEach(() => {
  cleanup();
  stepToEvent.mockClear();
});

const playback = (time: number, coveredTime: number) =>
  ({
    startTime: 0,
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
  trace: ExecutionTrace | null = null,
) =>
  render(
    <ExecutionTraceContext
      value={{ ...NO_VIEWED_EXECUTION, trace, clock, continuity }}
    >
      <EventPlaybackContext value={playback(3.4, 12)}>
        <EventTimeControls disabled={false} />
      </EventPlaybackContext>
    </ExecutionTraceContext>,
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
    expect(
      screen.getByRole("button", { name: "Go to the next event" }),
    ).toBeTruthy();
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
    expect(
      screen.getByRole("button", { name: "Go to the next step" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Go to the previous step" }),
    ).toBeTruthy();
  });

  it("moves the scrubber of a discrete run from event to event with the arrow keys", () => {
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
    renderControls("time", "continuous");

    fireEvent.keyDown(
      screen.getByRole("slider", { name: "Viewed simulation time" }),
      { key: "ArrowRight" },
    );
    expect(stepToEvent).not.toHaveBeenCalled();
  });

  it("reads an execution that happened in real time as the time of day", () => {
    // Local noon, so the reading is the same in every time zone.
    const epochMs = new Date(2026, 5, 5, 12, 0, 0).getTime();
    renderControls("time", "discrete", createQueueTrace({ epochMs }).trace);

    const readout = screen.getByRole("timer");
    expect(readout.textContent).toBe("12:00:03of 12:00:12");
    expect(readout.getAttribute("title")).toContain("12:00:03.400");
  });
});
