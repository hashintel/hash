/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { SweepNavigator } from "./sweep-navigator";

import type { ComponentProps } from "react";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const props: ComponentProps<typeof SweepNavigator> = {
  axes: [
    {
      identifier: "transmission_rate",
      min: 0.5,
      max: 4,
      stepCount: 50,
      integer: false,
    },
    {
      identifier: "recovery_rate",
      min: 0.2,
      max: 1.5,
      stepCount: 50,
      integer: false,
    },
  ],
  selection: {
    transmission_rate: { from: 0, to: 50 },
    recovery_rate: { from: 10, to: 30 },
  },
  status: {
    computing: false,
    following: null,
    runsCompleted: 0,
    runsSampled: 0,
    runTarget: null,
    runCount: 1000,
  },
  disabled: false,
  onSelectionChange: () => {},
};

it("shows one named slider per parameter and selects values on every axis when moved", async () => {
  const onSelectionChange = vi.fn();
  render(<SweepNavigator {...props} onSelectionChange={onSelectionChange} />);

  expect(screen.getAllByRole("slider")).toHaveLength(2);
  expect(screen.queryByText("Range")).toBeNull();
  expect(screen.queryByText("Point")).toBeNull();
  expect(screen.getByText("Move a slider to explore results.")).toBeTruthy();
  expect(onSelectionChange).not.toHaveBeenCalled();

  const slider = screen.getByRole("slider", { name: "Transmission rate" });
  fireEvent.focus(slider);
  fireEvent.keyDown(slider, { key: "ArrowRight" });

  await waitFor(() => {
    expect(onSelectionChange).toHaveBeenLastCalledWith({
      transmission_rate: { from: 26, to: 26 },
      recovery_rate: { from: 20, to: 20 },
    });
  });
});

it("preserves an explicit parameter label", () => {
  render(
    <SweepNavigator
      {...props}
      axes={[
        {
          identifier: "adhoc_count_queue",
          label: "Queue › count",
          min: 0,
          max: 100,
          stepCount: 50,
          integer: true,
        },
      ]}
    />,
  );
  expect(screen.getByRole("slider", { name: "Queue › count" })).toBeTruthy();
});

it("keeps optimizer-controlled sliders read-only", () => {
  const onSelectionChange = vi.fn();
  render(
    <SweepNavigator
      {...props}
      disabled
      onSelectionChange={onSelectionChange}
    />,
  );

  const slider = screen.getByRole("slider", { name: "Transmission rate" });
  expect(slider.getAttribute("aria-disabled")).toBe("true");
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  expect(onSelectionChange).not.toHaveBeenCalled();
});
