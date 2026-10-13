import type { ActionStepCheck, Duration } from "./types.js";

export type WaitError = { status: "error"; message: string };

const waitError = (message: string): WaitError => ({
  status: "error",
  message,
});

const second = 1_000;
const minute = 60 * second;
const hour = 60 * minute;
const day = 24 * hour;

const unitMs = {
  seconds: second,
  minutes: minute,
  hours: hour,
  days: day,
  weeks: 7 * day,
} as const satisfies Record<Duration["unit"], number>;

/** The longest a Wait step can pause for. */
export const maxWaitMs = 30 * day;

export const durationToMs = (duration: Duration): number =>
  duration.amount * unitMs[duration.unit];

/**
 * Checks a duration, which may come from JSON and so may not have the shape its type says.
 */
const validateDuration = (duration: unknown): WaitError | undefined => {
  if (
    typeof duration !== "object" ||
    duration === null ||
    Array.isArray(duration)
  ) {
    return waitError("A duration must be an object with an amount and a unit.");
  }

  const { amount, unit } = duration as Record<string, unknown>;

  if (typeof unit !== "string" || !Object.hasOwn(unitMs, unit)) {
    return waitError(
      `A duration's unit must be one of ${Object.keys(unitMs).join(", ")}.`,
    );
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return waitError("A duration's amount must be a number greater than 0.");
  }
  if (durationToMs({ amount, unit: unit as Duration["unit"] }) > maxWaitMs) {
    return waitError(
      `A Wait step can't wait for more than ${maxWaitMs / day} days.`,
    );
  }
  return undefined;
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
export const parseDateTime = (value: string): number | WaitError => {
  const invalid = waitError(
    `"${value}" isn't an ISO 8601 date and time with Z or an offset, e.g. "2026-10-16T14:00:00Z".`,
  );

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
    (Number(offsetHoursText) * hour + Number(offsetMinutesText) * minute);

  return date.getTime() - offsetMs;
};

/**
 * Works out when a Wait step that started at `startedAt` resumes, from either a `duration` to wait for or an
 * instant to wait `until`. Returns the instant as an ISO 8601 UTC string.
 *
 * An `until` in the past resumes at `startedAt`, i.e. straight away. A wait longer than {@link maxWaitMs} is an
 * error rather than being shortened.
 */
export const resolveResumeAt = (
  inputs: { duration?: Duration; until?: string },
  startedAt: Date,
): string | WaitError => {
  const { duration, until } = inputs;

  const startedAtMs = startedAt.getTime();

  if (duration !== undefined && until === undefined) {
    const error = validateDuration(duration);
    if (error) {
      return error;
    }
    return new Date(startedAtMs + durationToMs(duration)).toISOString();
  }

  if (until !== undefined && duration === undefined) {
    const untilMs = parseDateTime(until);
    if (typeof untilMs !== "number") {
      return untilMs;
    }
    if (untilMs - startedAtMs > maxWaitMs) {
      return waitError(
        `A Wait step can't wait until more than ${maxWaitMs / day} days after it starts.`,
      );
    }
    return new Date(Math.max(untilMs, startedAtMs)).toISOString();
  }

  return waitError(
    duration === undefined
      ? "A Wait step needs either a duration or an until time."
      : "A Wait step needs either a duration or an until time, not both.",
  );
};

/**
 * Checks a Wait step's inputs when the flow is defined. Inputs from a flow input or an earlier step, and the 30-day
 * limit on `until` (which depends on when the step starts), are checked by {@link resolveResumeAt} when it starts.
 */
export const checkWaitInputs: ActionStepCheck = ({ step, report }) => {
  const { duration, until } = step.inputs;

  if (!duration && !until) {
    report("duration", "Connect either a duration or an until time");
    return;
  }
  if (duration && until) {
    report("until", "Connect either a duration or an until time, not both");
    return;
  }

  /* A constant of another kind is reported as an incompatible connection. */
  if (duration?.kind === "constant" && duration.payload.kind === "Duration") {
    const error = validateDuration(duration.payload.value);
    if (error) {
      report("duration", error.message);
    }
  }

  if (until?.kind === "constant" && until.payload.kind === "DateTime") {
    const { value } = until.payload;
    const parsed =
      typeof value === "string"
        ? parseDateTime(value)
        : waitError("An until time must be a string.");
    if (typeof parsed !== "number") {
      report("until", parsed.message);
    }
  }
};
