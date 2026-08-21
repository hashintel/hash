import { describe, expect, it } from "vitest";

import {
  selectedProductionScheduleRange,
  subtractCalendarMonths,
} from "./schedule-dates";

describe("subtractCalendarMonths", () => {
  it("retains the day when the target month contains it", () => {
    expect(subtractCalendarMonths("2026-05-15", 3)).toBe("2026-02-15");
  });

  it("clamps month-end dates instead of rolling into the following month", () => {
    expect(subtractCalendarMonths("2026-05-31", 3)).toBe("2026-02-28");
    expect(subtractCalendarMonths("2024-05-31", 3)).toBe("2024-02-29");
    expect(subtractCalendarMonths("2026-01-31", 6)).toBe("2025-07-31");
  });
});

describe("selectedProductionScheduleRange", () => {
  const artifactBounds = { start: "2024-01-01", end: "2026-05-31" };

  it.each([
    ["3m", "2026-02-28"],
    ["6m", "2025-11-30"],
    ["12m", "2025-05-31"],
  ] as const)(
    "derives the %s preset from the artifact end",
    (preset, start) => {
      expect(
        selectedProductionScheduleRange({
          artifactBounds,
          customEnd: "",
          customStart: "",
          preset,
        }),
      ).toEqual({ start, end: artifactBounds.end });
    },
  );

  it("passes through custom bounds and clears all-production bounds", () => {
    expect(
      selectedProductionScheduleRange({
        artifactBounds,
        customEnd: "2025-03-04",
        customStart: "2025-02-03",
        preset: "custom",
      }),
    ).toEqual({ start: "2025-02-03", end: "2025-03-04" });
    expect(
      selectedProductionScheduleRange({
        artifactBounds,
        customEnd: "",
        customStart: "",
        preset: "all",
      }),
    ).toEqual({ start: null, end: null });
  });
});
