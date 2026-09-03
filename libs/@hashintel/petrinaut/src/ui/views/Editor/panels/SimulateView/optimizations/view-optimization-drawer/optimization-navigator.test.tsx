/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildOptimizationSurfaceAxes } from "../../../../../../../react/optimizations/surface-grid";
import {
  makeOptimizationInput,
  optimizedBindingSets,
} from "../optimizations-story-fixtures";
import {
  describeSelection,
  followedStep,
  OptimizationNavigator,
} from "./optimization-navigator";

import type {
  OptimizationNavigation,
  OptimizationSelectionStream,
} from "../../../../../../../react/optimizations/context";

vi.mock("@hashintel/ds-components", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@hashintel/ds-components")>();

  const Slider = ({
    min,
    max,
    step,
    value,
    onChange,
  }: {
    min: number;
    max: number;
    step: number;
    value: number;
    onChange?: (value: number) => void;
  }) => (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange?.(Number(event.target.value))}
    />
  );

  const Toggle = ({
    "aria-label": ariaLabel,
    labelOnText,
    onChange,
    value,
  }: {
    "aria-label"?: string;
    labelOnText?: string;
    onChange: (value: boolean) => void;
    value: boolean;
  }) => (
    <label>
      <input
        aria-label={ariaLabel}
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
      />
      {labelOnText}
    </label>
  );

  return { ...actual, Slider, Toggle };
});

afterEach(cleanup);

const input = makeOptimizationInput(optimizedBindingSets.base);
const axes = buildOptimizationSurfaceAxes(input);

const navigation: OptimizationNavigation = {
  positions: { production_rate: 10, selling_price: 20 },
  booleans: { express_shipping: false },
  followTrials: true,
};

const stream = (
  overrides: Partial<OptimizationSelectionStream>,
): OptimizationSelectionStream => ({
  key: "production_rate=10|selling_price=20",
  metricFrames: [],
  runsCompleted: 0,
  runTarget: null,
  computing: false,
  error: null,
  ...overrides,
});

const renderNavigator = (options: {
  running: boolean;
  selection?: OptimizationSelectionStream | null;
  onNavigationChange?: (patch: Partial<OptimizationNavigation>) => void;
}) =>
  render(
    <OptimizationNavigator
      axes={axes}
      booleanParameters={["express_shipping"]}
      navigation={navigation}
      selection={options.selection ?? null}
      running={options.running}
      onNavigationChange={options.onNavigationChange ?? (() => {})}
    />,
  );

describe("describeSelection", () => {
  it("names the followed step from the trial key, one-based", () => {
    expect(followedStep("trial:3")).toBe(3);
    expect(followedStep("production_rate=10")).toBeNull();
    expect(
      describeSelection(
        stream({ key: "trial:3", computing: true, runsCompleted: 1 }),
      ),
    ).toBe("Following step 4");
    expect(
      describeSelection(
        stream({ key: "trial:3", computing: false, runsCompleted: 3 }),
      ),
    ).toBe("Step 4 — 3 runs");
  });

  it("reports the ladder while refining and the run count once settled", () => {
    expect(describeSelection(null)).toBe("waiting for compute");
    expect(
      describeSelection(
        stream({ computing: true, runsCompleted: 8, runTarget: 25 }),
      ),
    ).toBe("8 of 25 runs — refining");
    expect(
      describeSelection(stream({ computing: true, runsCompleted: 8 })),
    ).toBe("8 runs — computing");
    expect(describeSelection(stream({ runsCompleted: 100 }))).toBe("100 runs");
  });

  it("names the failure when the point could not compute", () => {
    expect(
      describeSelection(
        stream({ runsCompleted: 8, error: "cpu: unsupported net" }),
      ),
    ).toBe("Could not compute: cpu: unsupported net");
  });
});

describe("OptimizationNavigator", () => {
  it("moves one axis and stops following on a slider change", () => {
    const onNavigationChange = vi.fn();
    renderNavigator({ running: true, onNavigationChange });

    const [productionRate] = screen.getAllByRole("slider");
    fireEvent.change(productionRate!, { target: { value: "12" } });

    expect(onNavigationChange).toHaveBeenCalledWith({
      positions: { production_rate: 12, selling_price: 20 },
      followTrials: false,
    });
  });

  it("toggles a boolean parameter and stops following", () => {
    const onNavigationChange = vi.fn();
    renderNavigator({ running: false, onNavigationChange });

    fireEvent.click(screen.getByRole("checkbox", { name: "express_shipping" }));

    expect(onNavigationChange).toHaveBeenCalledWith({
      booleans: { express_shipping: true },
      followTrials: false,
    });
  });

  it("offers the follow switch only while the study runs", () => {
    const onNavigationChange = vi.fn();
    const { unmount } = render(
      <OptimizationNavigator
        axes={axes}
        booleanParameters={[]}
        navigation={navigation}
        selection={stream({ key: "trial:0", computing: true })}
        running
        onNavigationChange={onNavigationChange}
      />,
    );

    expect(screen.getByText("Following step 1")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Follow steps"));
    expect(onNavigationChange).toHaveBeenCalledWith({ followTrials: false });
    unmount();

    renderNavigator({ running: false });
    expect(screen.queryByLabelText("Follow steps")).toBeNull();
  });

  it("shows a failure in the error tone", () => {
    renderNavigator({
      running: false,
      selection: stream({ error: "cpu: unsupported net" }),
    });

    expect(
      screen.getByText("Could not compute: cpu: unsupported net").dataset.tone,
    ).toBe("error");
  });

  it("reads each axis value at its position", () => {
    renderNavigator({
      running: false,
      selection: stream({ runsCompleted: 100 }),
    });

    // production_rate spans 50..400 over 50 positions: position 10 is 120.
    expect(screen.getByText("120")).toBeTruthy();
    // selling_price spans 20..60: position 20 is 36.
    expect(screen.getByText("36")).toBeTruthy();
    expect(screen.getByText("100 runs")).toBeTruthy();
  });
});
