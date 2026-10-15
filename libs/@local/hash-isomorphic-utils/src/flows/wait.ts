import { parseDateTime } from "./datetime.js";

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
 * Reads a duration into milliseconds. It may come from JSON, so it may not have the shape its type says.
 */
const parseDuration = (duration: unknown): number | WaitError => {
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
  const durationMs = durationToMs({ amount, unit: unit as Duration["unit"] });
  if (durationMs > maxWaitMs) {
    return waitError(
      `A Wait step can't wait for more than ${maxWaitMs / day} days.`,
    );
  }
  return durationMs;
};

/**
 * Works out when a Wait step that started at `startedAt` resumes, from either a `duration` to wait for or an
 * instant to wait `until`. Returns the instant as an ISO 8601 UTC string.
 *
 * An `until` in the past resumes at `startedAt`, i.e. straight away. A wait longer than {@link maxWaitMs} is an
 * error rather than being shortened. The inputs may come from a flow input or an earlier step without being
 * checked, so they're read as `unknown`.
 */
export const resolveResumeAt = (
  inputs: { duration?: unknown; until?: unknown },
  startedAt: Date,
): string | WaitError => {
  const { duration, until } = inputs;

  const startedAtMs = startedAt.getTime();

  if (duration !== undefined && until === undefined) {
    const durationMs = parseDuration(duration);
    if (typeof durationMs !== "number") {
      return durationMs;
    }
    return new Date(startedAtMs + durationMs).toISOString();
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
    const parsed = parseDuration(duration.payload.value);
    if (typeof parsed !== "number") {
      report("duration", parsed.message);
    }
  }

  if (until?.kind === "constant" && until.payload.kind === "DateTime") {
    const parsed = parseDateTime(until.payload.value);
    if (typeof parsed !== "number") {
      report("until", parsed.message);
    }
  }
};
