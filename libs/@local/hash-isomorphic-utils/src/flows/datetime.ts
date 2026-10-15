const minuteMs = 60_000;
const hourMs = 60 * minuteMs;

/** The length of a UTC calendar day, which has no leap seconds in epoch time. */
export const dayMs = 24 * hourMs;

/** Whether a string is an ISO calendar date (YYYY-MM-DD) that exists, e.g. not 2025-02-30. */
export const isIsoDate = (value: string): boolean => {
  const timestamp = Date.parse(value);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
};

/**
 * `YYYY-MM-DDTHH:mm[:ss[.fraction]]` followed by `Z` or an offset, with hours, minutes and seconds in range.
 * `Date.parse` alone reads a value without a timezone as local time, accepts implementation-specific formats, and
 * rolls over impossible values such as February 30th or 24:00.
 */
const dateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d+))?)?(?:Z|([+-])([01]\d|2[0-3]):([0-5]\d))$/;

/**
 * Parses an ISO 8601 instant with `Z` or an offset, e.g. `"2026-10-16T14:00:00Z"` or `"2026-10-16T16:00:00+02:00"`,
 * into epoch milliseconds.
 */
export const parseDateTime = (
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

  const match = dateTimePattern.exec(value);
  if (!match) {
    return invalid;
  }

  const [
    ,
    yearText,
    monthText,
    dayText,
    hoursText,
    minutesText,
    secondsText = "0",
    fraction = "",
    offsetSign,
    offsetHoursText = "0",
    offsetMinutesText = "0",
  ] = match;

  const year = Number(yearText);
  const month = Number(monthText);
  const dayOfMonth = Number(dayText);

  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, dayOfMonth);
  date.setUTCHours(
    Number(hoursText),
    Number(minutesText),
    Number(secondsText),
    Number(fraction.padEnd(3, "0").slice(0, 3)),
  );

  /* `setUTCFullYear` rolls over days that don't exist in the month, e.g. February 30th. */
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== dayOfMonth
  ) {
    return invalid;
  }

  const offsetMs =
    (offsetSign === "-" ? -1 : 1) *
    (Number(offsetHoursText) * hourMs + Number(offsetMinutesText) * minuteMs);

  return date.getTime() - offsetMs;
};
