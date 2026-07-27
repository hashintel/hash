const DAY_MS = 86_400_000;

type TickCadence =
  | { kind: "days"; step: 1 | 2 | 7 | 14; approximateDays: number }
  | { kind: "months"; step: 1 | 2 | 3 | 6 | 12; approximateDays: number };

const TICK_CADENCES: TickCadence[] = [
  { kind: "days", step: 1, approximateDays: 1 },
  { kind: "days", step: 2, approximateDays: 2 },
  { kind: "days", step: 7, approximateDays: 7 },
  { kind: "days", step: 14, approximateDays: 14 },
  { kind: "months", step: 1, approximateDays: 30.44 },
  { kind: "months", step: 2, approximateDays: 60.88 },
  { kind: "months", step: 3, approximateDays: 91.31 },
  { kind: "months", step: 6, approximateDays: 182.63 },
  { kind: "months", step: 12, approximateDays: 365.25 },
];

const chooseTickCadence = (targetDays: number): TickCadence =>
  TICK_CADENCES.reduce((best, cadence) =>
    Math.abs(Math.log(cadence.approximateDays / targetDays)) <
    Math.abs(Math.log(best.approximateDays / targetDays))
      ? cadence
      : best,
  );

const calendarTicks = (
  startDay: number,
  endDay: number,
  cadence: TickCadence,
): number[] => {
  if (cadence.kind === "days") {
    const mondayOffset = cadence.step >= 7 ? 4 : 0;
    const first =
      Math.ceil((startDay - mondayOffset) / cadence.step) * cadence.step +
      mondayOffset;
    return Array.from(
      { length: Math.floor((endDay - first) / cadence.step) + 1 },
      (_, index) => first + index * cadence.step,
    );
  }

  const firstDate = new Date(startDay * DAY_MS);
  firstDate.setUTCHours(0, 0, 0, 0);
  firstDate.setUTCDate(1);
  const monthIndex = firstDate.getUTCFullYear() * 12 + firstDate.getUTCMonth();
  const alignedMonth = Math.ceil(monthIndex / cadence.step) * cadence.step;
  firstDate.setUTCFullYear(Math.floor(alignedMonth / 12));
  firstDate.setUTCMonth(alignedMonth % 12);
  if (firstDate.getTime() / DAY_MS < startDay) {
    firstDate.setUTCMonth(firstDate.getUTCMonth() + cadence.step);
  }

  const ticks: number[] = [];
  for (
    let date = firstDate;
    date.getTime() / DAY_MS <= endDay;
    date = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + cadence.step, 1),
    )
  ) {
    ticks.push(date.getTime() / DAY_MS);
  }
  return ticks;
};

export const formatCalendarDay = (day: number): string =>
  new Date(day * DAY_MS).toISOString().slice(0, 10);

export const deriveCalendarDateAxis = ({
  effectivePixelsPerDay,
  endDay,
  minimumLabelSpacing,
  startDay,
  targetTickWidth,
}: {
  effectivePixelsPerDay: number;
  endDay: number;
  minimumLabelSpacing: number;
  startDay: number;
  targetTickWidth: number;
}): { cadence: TickCadence; ticks: number[] } => {
  const cadence = chooseTickCadence(
    targetTickWidth / Math.max(effectivePixelsPerDay, 0.1),
  );
  const ticks = [startDay, ...calendarTicks(startDay, endDay, cadence)]
    .filter((day, index, days) => index === 0 || day !== days[index - 1])
    .filter(
      (day, index, days) =>
        index === 0 ||
        (day - days[index - 1]!) * effectivePixelsPerDay >= minimumLabelSpacing,
    );

  return { cadence, ticks };
};
