const minutesPerHour = 60;
const hoursPerDay = 24;
const isoDateLength = "YYYY-MM-DD".length;
const millisecondDigits = 3;

export const minuteMs = 60_000;
export const hourMs = minutesPerHour * minuteMs;
export const dayMs = hoursPerDay * hourMs;

/** Whether a string is an ISO calendar date (YYYY-MM-DD) that exists, e.g. not 2025-02-30. */
export const isIsoDate = (value: string): boolean => {
  const timestamp = Date.parse(value);
  return (
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, isoDateLength) === value
  );
};

/**
 * `YYYY-MM-DDTHH:mm[:ss[.fraction]]` followed by `Z` or an offset, with hours, minutes and seconds in range.
 * `Date.parse` alone reads a value without a timezone as local time, accepts implementation-specific formats, and
 * rolls over impossible values such as February 30th or 24:00.
 */
const dateTimePattern =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hours>[01]\d|2[0-3]):(?<minutes>[0-5]\d)(?::(?<seconds>[0-5]\d)(?:\.(?<fraction>\d+))?)?(?:Z|(?<offsetSign>[+-])(?<offsetHours>[01]\d|2[0-3]):(?<offsetMinutes>[0-5]\d))$/u;

/**
 * Parses an ISO 8601 instant with `Z` or an offset, e.g. `"2026-10-16T14:00:00Z"` or `"2026-10-16T16:00:00+02:00"`,
 * into epoch milliseconds.
 */
export const parseDateTime = (
  // oxlint-disable-next-line typescript/no-restricted-types -- the value comes from parsed JSON and is checked to be a string below
  value: unknown,
): number | { status: "error"; message: string } => {
  /* `RegExp.exec` would read a value from JSON such as `["2026-10-16T14:00:00Z"]` as the string inside it. */
  if (typeof value !== "string") {
    return { status: "error", message: "A date and time must be a string." };
  }

  const invalid = {
    status: "error",
    message: `"${value}" isn't an ISO 8601 date and time with Z or an offset, e.g. "2026-10-16T14:00:00Z".`,
  } as const;

  const groups = dateTimePattern.exec(value)?.groups;
  if (groups === undefined) {
    return invalid;
  }

  const {
    year: yearText,
    month: monthText,
    day: dayText,
    hours: hoursText,
    minutes: minutesText,
    seconds: secondsText = "0",
    fraction = "",
    offsetSign,
    offsetHours: offsetHoursText = "0",
    offsetMinutes: offsetMinutesText = "0",
  } = groups;

  const year = Number(yearText);
  const month = Number(monthText);
  const dayOfMonth = Number(dayText);

  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, dayOfMonth);
  date.setUTCHours(
    Number(hoursText),
    Number(minutesText),
    Number(secondsText),
    Number(fraction.padEnd(millisecondDigits, "0").slice(0, millisecondDigits)),
  );

  /* `setUTCFullYear` rolls over days that don't exist in the month, e.g. February 30th. */
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== dayOfMonth
  ) {
    return invalid;
  }

  let offsetDirection = 1;
  if (offsetSign === "-") {
    offsetDirection = -1;
  }

  const offsetMs =
    offsetDirection *
    (Number(offsetHoursText) * hourMs + Number(offsetMinutesText) * minuteMs);

  return date.getTime() - offsetMs;
};
