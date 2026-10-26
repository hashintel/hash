import { dayMs, hourMs, minuteMs, parseDateTime } from "./datetime.js";

import type { ActionStepCheck, Duration } from "./types.js";

export interface WaitError {
  status: "error";
  message: string;
}

const waitError = (message: string): WaitError => ({
  status: "error",
  message,
});

const secondMs = 1000;
const daysPerWeek = 7;
const maxWaitDays = 30;

const unitMs = {
  seconds: secondMs,
  minutes: minuteMs,
  hours: hourMs,
  days: dayMs,
  weeks: daysPerWeek * dayMs,
} as const satisfies Record<Duration["unit"], number>;

/** The longest a Wait step can pause for. */
export const maxWaitMs = maxWaitDays * dayMs;

export const durationToMs = (duration: Duration): number =>
  duration.amount * unitMs[duration.unit];

const isDurationUnit = (unit: string): unit is Duration["unit"] =>
  Object.hasOwn(unitMs, unit);

/**
 * Reads a duration into milliseconds. It may come from JSON, so it may not have the shape its type says.
 */
// oxlint-disable-next-line typescript/no-restricted-types -- a duration may come from JSON, so its shape is validated here
const parseDuration = (duration: unknown): number | WaitError => {
  if (
    typeof duration !== "object" ||
    duration === null ||
    Array.isArray(duration)
  ) {
    return waitError("A duration must be an object with an amount and a unit.");
  }

  const amount = "amount" in duration ? duration.amount : undefined;
  const unit = "unit" in duration ? duration.unit : undefined;

  if (typeof unit !== "string" || !isDurationUnit(unit)) {
    return waitError(
      `A duration's unit must be one of ${Object.keys(unitMs).join(", ")}.`,
    );
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return waitError("A duration's amount must be a number greater than 0.");
  }
  const durationMs = durationToMs({ amount, unit });
  if (durationMs > maxWaitMs) {
    return waitError(
      `A Wait step can't wait for more than ${maxWaitMs / dayMs} days.`,
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
  // oxlint-disable-next-line typescript/no-restricted-types -- inputs may come from a flow input or an earlier step without being checked
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
        `A Wait step can't wait until more than ${maxWaitMs / dayMs} days after it starts.`,
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
 * Checks a Wait step's inputs when the flow is defined. Inputs from a flow input or an earlier step, and the 30-dayMs
 * limit on `until` (which depends on when the step starts), are checked by {@link resolveResumeAt} when it starts.
 */
export const checkWaitInputs: ActionStepCheck = ({ step, report }) => {
  const { duration, until } = step.inputs;

  if (duration === undefined && until === undefined) {
    report("duration", "Connect either a duration or an until time");
    return;
  }
  if (duration !== undefined && until !== undefined) {
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
