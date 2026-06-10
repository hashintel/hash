/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TimelineLegend } from "./legend";

import type { TimelineSeriesMeta } from "./types";

// Vitest globals are disabled in this package, so testing-library cannot
// auto-register its cleanup hook.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Run out the grace period that follows leaving the selector. */
const elapseReleaseDelay = () => {
  act(() => {
    vi.advanceTimersByTime(700);
  });
};

const createSeries = (count: number): TimelineSeriesMeta[] =>
  Array.from({ length: count }, (_, index) => ({
    seriesId: `series-${index}`,
    seriesName: `Series ${index}`,
    color: "#336699",
  }));

/**
 * Owns the hidden-series state so strip interactions behave as they do under
 * the real EditorContext-backed wiring.
 */
const StatefulLegend = ({ series }: { series: TimelineSeriesMeta[] }) => {
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  return (
    <TimelineLegend
      series={series}
      hiddenSeries={hiddenSeries}
      onHiddenSeriesChange={setHiddenSeries}
    />
  );
};

describe("TimelineLegend", () => {
  it("lists only visible series in the strip, in series order", () => {
    const series = createSeries(3);

    render(
      <TimelineLegend
        series={series}
        hiddenSeries={new Set(["series-0"])}
        onHiddenSeriesChange={() => {}}
      />,
    );

    const actionButtons = screen.getAllByTitle(/^(Hide|Show) Series \d+$/u);

    expect(actionButtons.map((button) => button.title)).toEqual([
      "Hide Series 1",
      "Hide Series 2",
    ]);
    expect(screen.queryByTitle("Show Series 0")).toBeNull();
  });

  it("hides a series through its hover action", () => {
    const series = createSeries(3);
    const onHiddenSeriesChange = vi.fn();

    render(
      <TimelineLegend
        series={series}
        hiddenSeries={new Set()}
        onHiddenSeriesChange={onHiddenSeriesChange}
      />,
    );

    fireEvent.click(screen.getByTitle("Hide Series 1"));

    expect(onHiddenSeriesChange).toHaveBeenCalledWith(new Set(["series-1"]));
  });

  it("keeps just-hidden series until the pointer has left the selector for a while", () => {
    vi.useFakeTimers();
    const { container } = render(<StatefulLegend series={createSeries(3)} />);
    const control = container.querySelector('[data-part="control"]')!;

    // Several entries can be toggled in a row; leaving an individual entry
    // does not end the lingering window.
    fireEvent.click(screen.getByTitle("Hide Series 1"));
    fireEvent.pointerLeave(screen.getByTitle("Show Series 1").parentElement!);
    fireEvent.click(screen.getByTitle("Hide Series 2"));

    expect(screen.getByTitle("Show Series 1")).toBeDefined();
    expect(screen.getByTitle("Show Series 2")).toBeDefined();

    // Leaving the whole selector only starts the grace period.
    fireEvent.pointerLeave(control);
    expect(screen.getByTitle("Show Series 1")).toBeDefined();

    // After the delay the exit transitions start; entries stay mounted until
    // those finish (jsdom does not run transitions, so the end events are
    // fired manually).
    elapseReleaseDelay();
    expect(screen.getByTitle("Show Series 1")).toBeDefined();

    fireEvent.transitionEnd(screen.getByTitle("Show Series 1").parentElement!);
    fireEvent.transitionEnd(screen.getByTitle("Show Series 2").parentElement!);

    expect(screen.queryByTitle("Show Series 1")).toBeNull();
    expect(screen.queryByTitle("Show Series 2")).toBeNull();
    expect(screen.getByTitle("Hide Series 0")).toBeDefined();
  });

  it("keeps just-hidden series when the pointer returns within the grace period", () => {
    vi.useFakeTimers();
    const { container } = render(<StatefulLegend series={createSeries(3)} />);
    const control = container.querySelector('[data-part="control"]')!;

    fireEvent.click(screen.getByTitle("Hide Series 1"));
    fireEvent.pointerLeave(control);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    fireEvent.pointerEnter(control);
    elapseReleaseDelay();

    // The pending release was cancelled, so the entry is still in place.
    expect(screen.getByTitle("Show Series 1")).toBeDefined();
  });

  it("restores a just-hidden series when its action is clicked again", () => {
    vi.useFakeTimers();
    const { container } = render(<StatefulLegend series={createSeries(3)} />);
    const control = container.querySelector('[data-part="control"]')!;

    fireEvent.click(screen.getByTitle("Hide Series 1"));
    fireEvent.click(screen.getByTitle("Show Series 1"));

    fireEvent.pointerLeave(control);
    elapseReleaseDelay();

    // Visible again, so it stays in the strip after the pointer leaves.
    expect(screen.getByTitle("Hide Series 1")).toBeDefined();
  });

  it("summarizes series beyond the render cap with a +N more chip", () => {
    const series = createSeries(45);

    render(
      <TimelineLegend
        series={series}
        hiddenSeries={new Set()}
        onHiddenSeriesChange={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "+5 more" })).toBeDefined();
    expect(screen.queryByTitle("Hide Series 44")).toBeNull();
  });

  it("clears the search text without changing the selection", async () => {
    const series = createSeries(3);
    const onHiddenSeriesChange = vi.fn();

    render(
      <TimelineLegend
        series={series}
        hiddenSeries={new Set(["series-2"])}
        onHiddenSeriesChange={onHiddenSeriesChange}
      />,
    );

    const input = screen.getByLabelText("Filter timeline series");
    fireEvent.focus(input);
    fireEvent.input(input, { target: { value: "Series 1" } });

    fireEvent.click(
      await screen.findByRole("button", { name: "Clear search" }),
    );

    expect((input as HTMLInputElement).value).toBe("");
    expect(onHiddenSeriesChange).not.toHaveBeenCalled();
  });
});
