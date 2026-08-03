import { scheduleDayNumber } from "./model";

export const TIMELINE_LABEL_WIDTH = 220;
export const TIMELINE_LABEL_WIDTH_CSS = "[220px]" as const;
export const MATERIAL_TRACK_HEIGHT = 28;
export const MATERIAL_BAR_HEIGHT = 22;
export const MATERIAL_LANE_PADDING = 2;
export const OCCUPANCY_BAR_HEIGHT = 18;
export const OCCUPANCY_TRACK_GAP = 8;
export const OCCUPANCY_TRACK_HEIGHT =
  OCCUPANCY_BAR_HEIGHT + OCCUPANCY_TRACK_GAP;

export interface TimelineGeometry {
  dayCount: number;
  leftForDate: (date: string) => number;
  leftForDay: (day: number) => number;
  plotWidth: number;
  startDay: number;
  widthForDays: (days: number) => number;
}

export const createTimelineGeometry = ({
  dayCount,
  plotWidth,
  startDay,
}: {
  dayCount: number;
  plotWidth: number;
  startDay: number;
}): TimelineGeometry => {
  const pixelsPerDay = plotWidth / dayCount;
  return {
    dayCount,
    leftForDate: (date) => (scheduleDayNumber(date) - startDay) * pixelsPerDay,
    leftForDay: (day) => (day - startDay) * pixelsPerDay,
    plotWidth,
    startDay,
    widthForDays: (days) => Math.max(3, days * pixelsPerDay),
  };
};

export const inclusiveDayCount = (startDay: number, endDay: number): number =>
  endDay - startDay + 1;

export const inclusiveCalendarDays = (start: string, end: string): number =>
  inclusiveDayCount(scheduleDayNumber(start), scheduleDayNumber(end));
