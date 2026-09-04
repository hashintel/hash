/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { followedTrial } from "../../../../../../../react/optimizations/context";
import { buildOptimizationSurfaceAxes } from "../../../../../../../react/optimizations/surface-grid";
import {
  makeOptimizationInput,
  optimizedBindingSets,
} from "../optimizations-story-fixtures";
import {
  describeSelection,
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
    disabled,
    onChange,
  }: {
    min: number;
    max: number;
    step: number;
    value: number;
    disabled?: boolean;
    onChange?: (value: number) => void;
  }) => (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange?.(Number(event.target.value))}
    />
  );

  const Toggle = ({
    "aria-label": ariaLabel,
    labelOnText,
    disabled,
    onChange,
    value,
  }: {
    "aria-label"?: string;
    labelOnText?: string;
    disabled?: boolean;
    onChange: (value: boolean) => void;
    value: boolean;
  }) => (
    <label>
      <input
        aria-label={ariaLabel}
        type="checkbox"
        checked={value}
        disabled={disabled}
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
  note: null,
  ...overrides,
});

const renderNavigator = (options: {
  running: boolean;
  followTrials?: boolean;
  selection?: OptimizationSelectionStream | null;
  onNavigationChange?: (patch: Partial<OptimizationNavigation>) => void;
}) =>
  render(
    <OptimizationNavigator
      axes={axes}
      booleanParameters={["express_shipping"]}
      navigation={{
        ...navigation,
        followTrials: options.followTrials ?? navigation.followTrials,
      }}
      selection={options.selection ?? null}
      running={options.running}
      onNavigationChange={options.onNavigationChange ?? (() => {})}
    />,
  );

describe("describeSelection", () => {
  it("names the followed step from the trial key, one-based", () => {
    expect(followedTrial("trial:3")).toBe(3);
    expect(followedTrial("production_rate=10")).toBeNull();
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

  it("shows the note a ladder stopped with instead of the bare run count", () => {
    expect(
      describeSelection(
        stream({ runsCompleted: 8, note: "8 runs · cannot beat the best" }),
      ),
    ).toBe("8 runs · cannot beat the best");
    expect(
      describeSelection(
        stream({
          runsCompleted: 8,
          runTarget: 25,
          computing: true,
          note: "stale",
        }),
      ),
    ).toBe("8 of 25 runs — refining");
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
    renderNavigator({ running: true, followTrials: false, onNavigationChange });

    const [productionRate] = screen.getAllByRole("slider");
    fireEvent.change(productionRate!, { target: { value: "12" } });

    expect(onNavigationChange).toHaveBeenCalledWith({
      positions: { production_rate: 12, selling_price: 20 },
      followTrials: false,
    });
  });

  it("disables the controls while following a running study and frees them once it settles", () => {
    const { unmount } = renderNavigator({
      running: true,
      selection: stream({ key: "trial:0", computing: true }),
    });

    for (const slider of screen.getAllByRole("slider")) {
      expect(slider).toHaveProperty("disabled", true);
    }
    expect(
      screen.getByRole("checkbox", { name: "express_shipping" }),
    ).toHaveProperty("disabled", true);
    expect(screen.getByLabelText("Follow steps")).toHaveProperty(
      "disabled",
      false,
    );
    unmount();

    renderNavigator({ running: false });
    for (const slider of screen.getAllByRole("slider")) {
      expect(slider).toHaveProperty("disabled", false);
    }
    expect(
      screen.getByRole("checkbox", { name: "express_shipping" }),
    ).toHaveProperty("disabled", false);
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
