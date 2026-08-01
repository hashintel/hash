import { describe, expect, it } from "vitest";

import {
  createTimelineGeometry,
  inclusiveCalendarDays,
  inclusiveDayCount,
  OCCUPANCY_BAR_HEIGHT,
  OCCUPANCY_TRACK_GAP,
  OCCUPANCY_TRACK_HEIGHT,
  TIMELINE_LABEL_WIDTH,
  TIMELINE_LABEL_WIDTH_CSS,
} from "./timeline-geometry";

describe("timeline geometry", () => {
  it("uses one label width and inclusive day calculation", () => {
    expect(TIMELINE_LABEL_WIDTH_CSS).toBe(`[${TIMELINE_LABEL_WIDTH}px]`);
    expect(inclusiveDayCount(10, 12)).toBe(3);
    expect(inclusiveCalendarDays("2026-01-30", "2026-02-01")).toBe(3);
    expect(OCCUPANCY_BAR_HEIGHT).toBe(18);
    expect(OCCUPANCY_TRACK_GAP).toBe(8);
    expect(OCCUPANCY_TRACK_HEIGHT).toBe(26);
  });

  it("derives consistent date, day, and duration geometry", () => {
    const geometry = createTimelineGeometry({
      dayCount: 10,
      plotWidth: 100,
      startDay: 20,
    });
    expect(geometry.leftForDay(23)).toBe(30);
    expect(geometry.widthForDays(inclusiveDayCount(23, 25))).toBe(30);
  });
});
