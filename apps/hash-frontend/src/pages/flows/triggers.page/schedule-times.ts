import { getTimeZoneCity, parseCronFields } from "../../shared/schedule-repeat";

import type { CalendarDate } from "../../shared/schedule-repeat";
import type { ScheduleSpec } from "@local/hash-isomorphic-utils/flows/schedule-types";

/** How far ahead to look for a cron expression's runs, so that one that never matches, e.g. 30 February, ends. */
const maxDaysAhead = 366 * 5;

const formatters = new Map<string, Intl.DateTimeFormat>();

/** The wall-clock fields of an instant in a time zone. */
const getZonedFields = (instant: number, timeZone: string) => {
  let formatter = formatters.get(timeZone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timeZone, formatter);
  }

  const fields: Record<string, number> = {};

  for (const { type, value } of formatter.formatToParts(instant)) {
    fields[type] = Number(value);
  }

  return {
    year: fields.year ?? 0,
    month: fields.month ?? 0,
    day: fields.day ?? 0,
    hour: fields.hour ?? 0,
    minute: fields.minute ?? 0,
    second: fields.second ?? 0,
  };
};

/** How far a time zone is ahead of UTC at an instant, in milliseconds. */
const getOffset = (instant: number, timeZone: string) => {
  const { year, month, day, hour, minute, second } = getZonedFields(
    instant,
    timeZone,
  );

  return (
    Date.UTC(year, month - 1, day, hour, minute, second) -
    Math.floor(instant / 1000) * 1000
  );
};

/**
 * The instant a wall-clock time in a time zone is at. A time skipped when the clocks go forward comes out an hour off,
 * so callers check it with `isWallClock`.
 */
const toInstant = (
  { year, month, day }: CalendarDate,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
) => {
  const wallClock = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstOffset = getOffset(wallClock, timeZone);
  const secondOffset = getOffset(wallClock - firstOffset, timeZone);

  return wallClock - secondOffset;
};

/** Whether an instant is at the wall-clock hour and minute in a time zone, which a time skipped by DST isn't. */
const isWallClock = (
  instant: number,
  hour: number,
  minute: number,
  timeZone: string,
) => {
  const fields = getZonedFields(instant, timeZone);

  return fields.hour === hour && fields.minute === minute;
};

/** The day it is at an instant in a time zone. */
export const getZonedDate = (instant: Date, timeZone: string): CalendarDate => {
  const { year, month, day } = getZonedFields(instant.getTime(), timeZone);

  return { year, month, day };
};

/**
 * The next times a schedule runs after an instant, at most `count` of them, or `null` if its cron expression isn't one
 * this can read, e.g. "@daily", or if none are found within five years. An interval runs at every multiple of it since
 * the Unix epoch, as Temporal runs one without an offset. A cron expression's time zone is UTC unless it has one, and a
 * time must match every field.
 */
export const getNextRuns = (
  scheduleSpec: ScheduleSpec,
  after: Date,
  count: number,
): Date[] | null => {
  if (scheduleSpec.type === "interval") {
    const { intervalMs } = scheduleSpec;
    const first =
      Math.floor(after.getTime() / intervalMs) * intervalMs + intervalMs;

    return Array.from(
      { length: count },
      (_, index) => new Date(first + index * intervalMs),
    );
  }

  const cron = parseCronFields(scheduleSpec.cronExpression);

  if (!cron) {
    return null;
  }

  const timeZone = scheduleSpec.timezone ?? "UTC";
  const afterMs = after.getTime();
  const today = getZonedDate(after, timeZone);
  const years = cron.years ? [...cron.years] : null;
  const laterYears = years?.filter((year) => year >= today.year) ?? null;

  if (laterYears?.length === 0) {
    return [];
  }

  /*
   * From the day before, as a run early on that day in the time zone can still be after the instant, or from the
   * first of a later year a cron is limited to, e.g. a one-off years ahead.
   */
  const firstYear = laterYears ? Math.min(...laterYears) : today.year;
  const firstDay =
    firstYear > today.year
      ? Date.UTC(firstYear, 0, 1)
      : Date.UTC(today.year, today.month - 1, today.day - 1);
  const runs: Date[] = [];
  let lastYear = firstYear;

  for (let offset = 0; offset <= maxDaysAhead; offset++) {
    const day = new Date(firstDay + offset * 86_400_000);
    const date = {
      year: day.getUTCFullYear(),
      month: day.getUTCMonth() + 1,
      day: day.getUTCDate(),
    };

    lastYear = date.year;

    if (
      !cron.months.has(date.month) ||
      !cron.daysOfMonth.has(date.day) ||
      !cron.daysOfWeek.has(day.getUTCDay()) ||
      (cron.years && !cron.years.has(date.year))
    ) {
      continue;
    }

    for (const hour of cron.hours) {
      /* Hours and minutes already past are skipped whole, as an every-second cron has thousands of times in them. */
      if (toInstant(date, hour, 59, 59, timeZone) <= afterMs) {
        continue;
      }

      for (const minute of cron.minutes) {
        if (toInstant(date, hour, minute, 59, timeZone) <= afterMs) {
          continue;
        }

        for (const second of cron.seconds) {
          const instant = toInstant(date, hour, minute, second, timeZone);

          /* Temporal skips a time the clocks jump over. */
          if (
            instant > afterMs &&
            isWallClock(instant, hour, minute, timeZone)
          ) {
            runs.push(new Date(instant));

            if (runs.length === count) {
              return runs;
            }
          }
        }
      }
    }
  }

  /* None in the search doesn't rule out later runs, unless the cron's years end before where it stopped. */
  return runs.length === 0 && !(years && Math.max(...years) < lastYear)
    ? null
    : runs;
};

/** When a run is, in the schedule's time zone, e.g. "Mon 23 Nov, 09:00". */
export const formatRunTime = (instant: Date, timeZone: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(instant)
      .map(({ type, value }) => [type, value]),
  );

  return `${parts.weekday} ${parts.day} ${parts.month}, ${parts.hour}:${parts.minute}`;
};

/** A time zone as the form lists it, by its city and its offset from UTC now, e.g. "London · GMT+1". */
export const getTimeZoneLabel = (timeZone: string, at: Date) => {
  if (timeZone === "UTC") {
    return "UTC";
  }

  const offset = (
    new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "shortOffset" })
      .formatToParts(at)
      .find(({ type }) => type === "timeZoneName")?.value ?? ""
  ).replace(/^GMT\+0$/, "GMT");

  return `${getTimeZoneCity(timeZone)} · ${offset}`;
};

/** The time zones the form offers: UTC, then every one the browser knows. */
export const getTimeZones = () => [
  "UTC",
  ...Intl.supportedValuesOf("timeZone").filter((zone) => zone !== "UTC"),
];
