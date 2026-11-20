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
 * The instant a wall-clock time in a time zone is at. A time skipped when the clocks go forward is taken at the offset
 * from before the change, so may be an hour off from when Temporal runs it.
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

/** The day it is at an instant in a time zone. */
export const getZonedDate = (instant: Date, timeZone: string): CalendarDate => {
  const { year, month, day } = getZonedFields(instant.getTime(), timeZone);

  return { year, month, day };
};

const monthNames = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const weekdayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * The values a cron field matches, as Temporal reads it: `*`, `x`, `x-z`, `x/y` (x, x+y, x+2y and so on), `x-z/y` and
 * lists of them, with names of months and weekdays, or `null` if it isn't one.
 */
const parseCronField = (
  field: string,
  min: number,
  max: number,
  names: string[] = [],
): Set<number> | null => {
  const values = new Set<number>();

  const parseValue = (text: string) => {
    const nameIndex = names.indexOf(text.slice(0, 3).toLowerCase());

    if (nameIndex !== -1 && /^[a-z]+$/i.test(text)) {
      return nameIndex + min;
    }

    return /^\d+$/.test(text) ? Number(text) : null;
  };

  for (const item of field.split(",")) {
    const [range = "", stepText, ...rest] = item.split("/");
    const step = stepText === undefined ? 1 : Number(stepText);

    if (rest.length > 0 || !Number.isInteger(step) || step < 1) {
      return null;
    }

    let first: number | null;
    let last: number | null;

    if (range === "*") {
      first = min;
      last = max;
    } else {
      const [start = "", end, ...more] = range.split("-");

      if (more.length > 0) {
        return null;
      }

      first = parseValue(start);
      last =
        end !== undefined
          ? parseValue(end)
          : stepText === undefined
            ? first
            : max;
    }

    if (first === null || last === null || first < min || last > max) {
      return null;
    }

    for (let value = first; value <= last; value += step) {
      values.add(value);
    }
  }

  return values;
};

type CronFields = {
  seconds: number[];
  minutes: number[];
  hours: number[];
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  /** `null` for any year. */
  years: Set<number> | null;
};

/** A cron expression's fields, in Temporal's order: five, a sixth for the year, or a seventh first for the second. */
const parseCronExpression = (cronExpression: string): CronFields | null => {
  const fields = cronExpression.trim().split(/\s+/);

  if (fields.length < 5 || fields.length > 7) {
    return null;
  }

  const [secondField = "0", ...rest] =
    fields.length === 7 ? fields : ["0", ...fields];
  const [minute, hour, dayOfMonth, month, dayOfWeek, year = "*"] = rest;

  const seconds = parseCronField(secondField, 0, 59);
  const minutes = parseCronField(minute ?? "", 0, 59);
  const hours = parseCronField(hour ?? "", 0, 23);
  const daysOfMonth = parseCronField(dayOfMonth ?? "", 1, 31);
  const months = parseCronField(month ?? "", 1, 12, monthNames);
  /* 7 is Sunday too. */
  const daysOfWeek = parseCronField(dayOfWeek ?? "", 0, 7, weekdayNames);
  const years = year === "*" ? null : parseCronField(year, 1970, 9999);

  if (
    !seconds ||
    !minutes ||
    !hours ||
    !daysOfMonth ||
    !months ||
    !daysOfWeek ||
    (year !== "*" && !years)
  ) {
    return null;
  }

  const sorted = (values: Set<number>) =>
    [...values].sort((left, right) => left - right);

  return {
    seconds: sorted(seconds),
    minutes: sorted(minutes),
    hours: sorted(hours),
    daysOfMonth,
    months,
    daysOfWeek: new Set([...daysOfWeek].map((weekday) => weekday % 7)),
    years,
  };
};

/**
 * The next times a schedule runs after an instant, at most `count` of them, or `null` if its cron expression isn't one
 * this can read, e.g. "@daily". An interval runs at every multiple of it since the Unix epoch, as Temporal runs one
 * without an offset. A cron expression's time zone is UTC unless it has one, and a time must match every field.
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

  const cron = parseCronExpression(scheduleSpec.cronExpression);

  if (!cron) {
    return null;
  }

  const timeZone = scheduleSpec.timezone ?? "UTC";
  const today = getZonedDate(after, timeZone);
  const runs: Date[] = [];

  /* From the day before, as a run early on that day in the time zone can still be after the instant. */
  for (let offset = -1; offset <= maxDaysAhead; offset++) {
    const day = new Date(
      Date.UTC(today.year, today.month - 1, today.day + offset),
    );
    const date = {
      year: day.getUTCFullYear(),
      month: day.getUTCMonth() + 1,
      day: day.getUTCDate(),
    };

    if (
      !cron.months.has(date.month) ||
      !cron.daysOfMonth.has(date.day) ||
      !cron.daysOfWeek.has(day.getUTCDay()) ||
      (cron.years && !cron.years.has(date.year))
    ) {
      continue;
    }

    for (const hour of cron.hours) {
      for (const minute of cron.minutes) {
        for (const second of cron.seconds) {
          const instant = toInstant(date, hour, minute, second, timeZone);

          if (instant > after.getTime()) {
            runs.push(new Date(instant));

            if (runs.length === count) {
              return runs;
            }
          }
        }
      }
    }
  }

  return runs;
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
  const city = (timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ");

  return `${city} · ${offset}`;
};

/** The browser's time zone, which a new trigger starts in. */
export const getBrowserTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The time zones the form offers: UTC, then every one the browser knows. */
export const getTimeZones = () => [
  "UTC",
  ...Intl.supportedValuesOf("timeZone").filter((zone) => zone !== "UTC"),
];
