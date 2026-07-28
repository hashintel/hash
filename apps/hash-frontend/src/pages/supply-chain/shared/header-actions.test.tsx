// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OutlierContext } from "./cost";
import { AnalysisSettingsPanel } from "./header-actions";
import { MeasureContext } from "./measure-context";
import { TimeRangeContext } from "./time-range-context";

vi.mock("@hashintel/ds-components", () => ({
  Icon: () => null,
  NumberInput: () => <input readOnly />,
}));

describe("AnalysisSettingsPanel", () => {
  afterEach(cleanup);

  it("allows the mean outlier policy to change under non-mean headline measures", () => {
    const setExcludeOutliers = vi.fn();

    render(
      <TimeRangeContext.Provider
        value={{ timeRange: "12m", setTimeRange: vi.fn() }}
      >
        <MeasureContext.Provider
          value={{ measure: "p95", setMeasure: vi.fn() }}
        >
          <OutlierContext.Provider
            value={{ excludeOutliers: true, setExcludeOutliers }}
          >
            <AnalysisSettingsPanel />
          </OutlierContext.Provider>
        </MeasureContext.Provider>
      </TimeRangeContext.Provider>,
    );

    const checkbox = screen.getByRole("checkbox", {
      name: "Exclude outliers from mean",
    });
    expect(checkbox).toHaveProperty("checked", true);
    expect(checkbox).toHaveProperty("disabled", false);
    fireEvent.click(checkbox);
    expect(setExcludeOutliers).toHaveBeenCalledWith(false);
  });
});
