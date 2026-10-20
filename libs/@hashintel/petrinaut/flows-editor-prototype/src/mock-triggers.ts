/**
 * How runs start. Triggers live outside the flow (ledger, 8–9 Oct).
 *
 * - Manual runs use the form generated from the Start inputs, as the legacy run modal does.
 * - Schedules use the engine's real `ScheduleSpec` (Temporal schedules exist on `main`).
 * - MOCK: entity triggers. `main` has no trigger on an entity being created or updated, so its shape is made up here.
 */
import type { CronScheduleSpec } from "./engine";

export type ScheduleDraft = {
  spec: CronScheduleSpec;
  /** What the schedule gives each Start input on every run, keyed by input name. */
  inputValues: Record<string, string | number | null>;
  enabled: boolean;
};

/** MOCK: a trigger on an entity of one type being created or updated. */
export type EntityTriggerDraft = {
  entityTypeBaseUrl: string;
  on: "created" | "updated" | "createdOrUpdated";
  /** The Start input that receives the entity that changed. */
  passesTo: string | null;
  enabled: boolean;
};

export type MockTriggers = {
  schedule: ScheduleDraft | null;
  entity: EntityTriggerDraft | null;
};

export type Repeat = "day" | "week" | "month";

/** A cron expression from the plain choices the schedule form offers. */
export const toCron = ({
  repeat,
  time,
  dayOfMonth,
  dayOfWeek,
}: {
  repeat: Repeat;
  time: string;
  dayOfMonth: number;
  dayOfWeek: number;
}) => {
  const [hours = "9", minutes = "0"] = time.split(":");
  const minute = String(Number(minutes));
  const hour = String(Number(hours));
  switch (repeat) {
    case "day":
      return `${minute} ${hour} * * *`;
    case "week":
      return `${minute} ${hour} * * ${dayOfWeek}`;
    case "month":
      return `${minute} ${hour} ${dayOfMonth} * *`;
  }
};

/** Reads the plain choices back from a cron expression the form wrote. */
export const fromCron = (expression: string) => {
  const [minute = "0", hour = "9", dayOfMonth = "*", , dayOfWeek = "*"] =
    expression.split(" ");
  const time = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  if (dayOfMonth !== "*") {
    return {
      repeat: "month" as const,
      time,
      dayOfMonth: Number(dayOfMonth),
      dayOfWeek: 1,
    };
  }
  if (dayOfWeek !== "*") {
    return {
      repeat: "week" as const,
      time,
      dayOfMonth: 1,
      dayOfWeek: Number(dayOfWeek),
    };
  }
  return { repeat: "day" as const, time, dayOfMonth: 1, dayOfWeek: 1 };
};

const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const ordinal = (day: number) => {
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";
  return `${day}${suffix}`;
};

/** One sentence for a schedule, as Retool writes them ("At 09:00 on the 1st of every month"). */
export const describeCron = (spec: CronScheduleSpec) => {
  const { repeat, time, dayOfMonth, dayOfWeek } = fromCron(spec.cronExpression);
  const zone = spec.timezone ? ` (${spec.timezone})` : "";
  switch (repeat) {
    case "day":
      return `Every day at ${time}${zone}`;
    case "week":
      return `Every ${weekdays[dayOfWeek] ?? "Monday"} at ${time}${zone}`;
    case "month":
      return `At ${time} on the ${ordinal(dayOfMonth)} of every month${zone}`;
  }
};

export { weekdays };
