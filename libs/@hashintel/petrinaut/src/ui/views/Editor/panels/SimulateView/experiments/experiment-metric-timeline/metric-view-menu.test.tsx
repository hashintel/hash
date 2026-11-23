/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { describeMetricView } from "./describe-metric-view";
import { MetricViewMenu } from "./metric-view-menu";
import {
  DEFAULT_METRIC_VIEW_SETTINGS,
  type MetricViewSettings,
} from "./view-state";

import type { MetricFrame } from "./shared/metric-frames";

vi.mock("@hashintel/ds-components", async (importOriginal) => {
  const [actual, stubs] = await Promise.all([
    importOriginal<typeof import("@hashintel/ds-components")>(),
    import("../../shared/ds-control-stubs"),
  ]);
  return { ...actual, ...stubs };
});

afterEach(cleanup);

/** The menu over its own settings, with the subtitle a card would read them back as. */
const Harness = ({
  outputType,
  initialSettings = DEFAULT_METRIC_VIEW_SETTINGS,
  onChange,
}: {
  outputType: MetricFrame["outputType"];
  initialSettings?: MetricViewSettings;
  onChange?: (settings: MetricViewSettings) => void;
}) => {
  const [settings, setSettings] = useState(initialSettings);
  return (
    <>
      <MetricViewMenu
        outputType={outputType}
        value={settings}
        onChange={(next) => {
          setSettings(next);
          onChange?.(next);
        }}
      />
      <span data-testid="subtitle">
        {describeMetricView(settings, outputType)}
      </span>
    </>
  );
};

const openMenu = () => {
  fireEvent.click(screen.getByRole("button", { name: "Chart options" }));
};

const modeGroup = (label: string) =>
  screen.getByRole("group", { name: `${label} mode` });

const pickMode = (label: string, mode: string) => {
  fireEvent.click(within(modeGroup(label)).getByRole("button", { name: mode }));
};

const pickChoice = (label: string, value: string) => {
  fireEvent.change(screen.getByRole("combobox", { name: label }), {
    target: { value },
  });
};

const choice = (label: string): string =>
  screen.getByRole<HTMLSelectElement>("combobox", { name: label }).value;

const isPressed = (label: string, mode: string): boolean =>
  within(modeGroup(label))
    .getByRole("button", { name: mode })
    .getAttribute("aria-pressed") === "true";

describe("MetricViewMenu", () => {
  it("opens a popover from the ellipsis button and says so on the button", () => {
    render(<Harness outputType="distribution" />);
    const trigger = screen.getByRole("button", { name: "Chart options" });

    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("combobox")).toBeNull();

    openMenu();

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Runs")).toBeTruthy();
    expect(screen.getByText("Time")).toBeTruthy();
  });

  it("offers the runs block for a distribution metric only", () => {
    const view = render(<Harness outputType="distribution" />);
    openMenu();
    expect(screen.getByRole("combobox", { name: "Runs" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Time" })).toBeTruthy();
    view.unmount();

    render(<Harness outputType="scalar" />);
    openMenu();
    expect(screen.queryByRole("combobox", { name: "Runs" })).toBeNull();
    expect(screen.queryByText("Runs")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Time" })).toBeTruthy();
  });

  it("shows each block's current side and choice", () => {
    render(
      <Harness
        outputType="distribution"
        initialSettings={{
          ...DEFAULT_METRIC_VIEW_SETTINGS,
          aggregateRuns: true,
          runAggregation: "p90",
          aggregateTime: false,
          timeTrace: "maxToDate",
        }}
      />,
    );
    openMenu();

    expect(isPressed("Runs", "Aggregate")).toBe(true);
    expect(isPressed("Runs", "Every run")).toBe(false);
    expect(choice("Runs")).toBe("p90");
    expect(isPressed("Time", "Every step")).toBe(true);
    expect(choice("Time")).toBe("maxToDate");
  });

  it("aggregates the runs field by field and keeps the statistic when switching back", () => {
    const onChange = vi.fn();
    render(<Harness outputType="distribution" onChange={onChange} />);
    openMenu();

    pickMode("Runs", "Aggregate");
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_METRIC_VIEW_SETTINGS,
      aggregateRuns: true,
    });
    expect(choice("Runs")).toBe("mean");

    pickChoice("Runs", "median");
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_METRIC_VIEW_SETTINGS,
      aggregateRuns: true,
      runAggregation: "median",
    });
    expect(screen.getByTestId("subtitle").textContent).toBe(
      "median over runs · value over time",
    );

    pickMode("Runs", "Every run");
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_METRIC_VIEW_SETTINGS,
      aggregateRuns: false,
      runAggregation: "median",
    });
    expect(choice("Runs")).toBe("heatmap");
    expect(screen.getByTestId("subtitle").textContent).toBe(
      "heatmap · value over time",
    );

    pickChoice("Runs", "bands");
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_METRIC_VIEW_SETTINGS,
      distributionView: "bands",
      runAggregation: "median",
    });
  });

  it("aggregates over time field by field and keeps the trace when switching back", () => {
    const onChange = vi.fn();
    render(<Harness outputType="scalar" onChange={onChange} />);
    openMenu();

    pickChoice("Time", "minToDate");
    expect(screen.getByTestId("subtitle").textContent).toBe("minimum to date");

    pickMode("Time", "Aggregate");
    pickChoice("Time", "sum");
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_METRIC_VIEW_SETTINGS,
      timeTrace: "minToDate",
      aggregateTime: true,
      timeAggregation: "sum",
    });
    expect(screen.getByTestId("subtitle").textContent).toBe("sum over time");

    pickMode("Time", "Every step");
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_METRIC_VIEW_SETTINGS,
      timeTrace: "minToDate",
      aggregateTime: false,
      timeAggregation: "sum",
    });
    expect(choice("Time")).toBe("minToDate");
  });

  it("stays open across choices", () => {
    render(<Harness outputType="distribution" />);
    openMenu();

    pickMode("Runs", "Aggregate");
    pickChoice("Runs", "max");
    pickMode("Time", "Aggregate");

    expect(screen.getByRole("combobox", { name: "Runs" })).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Chart options" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });
});
