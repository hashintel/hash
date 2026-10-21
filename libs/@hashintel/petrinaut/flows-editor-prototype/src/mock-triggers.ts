/**
 * Triggers → Start → steps (approved 21 Oct). Trigger nodes sit left of Start and lead into it; a flow can have
 * several. Start holds the flow's inputs (the engine's `FlowDefinition` inputs); each trigger maps its data onto
 * those inputs, a trigger field or a fixed value per input. Manual run is not a node: it's the Run button, whose form
 * is built from Start's inputs. Ports and settings follow Dora's draft PRD database.
 *
 * The engine's flow definition has inputs, not triggers, so all of this is an editor-layer concept.
 *
 * - Recurring schedule is backed by the engine's real `CronScheduleSpec` (Temporal schedules exist on `main`).
 * - MOCK: Entity created, Entity updated and Webhook received. `main` has no such triggers.
 */
import type { CronScheduleSpec, PayloadKind } from "./engine";
import type { IconName } from "@hashintel/ds-components";

export type TriggerKind =
  | "entityCreated"
  | "entityUpdated"
  | "schedule"
  | "webhook";

export type TriggerSettings = {
  /** Entity created / updated: the type to watch. */
  entityTypeBaseUrl?: string;
  /** Entity updated: only these properties start a run. Empty means any change. */
  propertiesToWatch?: string[];
  /** Entity created / updated: only start when the entity matches. Free text in the draft PRD. */
  condition?: string;
  /** Recurring schedule. */
  spec?: CronScheduleSpec;
  /** Webhook received: the address to call. */
  webhookUrl?: string;
  /** What this trigger gives each Start input, keyed by input name. */
  inputMap?: Record<string, InputMapping>;
};

/** A Start input filled from one of the trigger's fields, or a fixed value. */
export type InputMapping =
  | { kind: "field"; output: string }
  | { kind: "fixed"; value: string | number | null };

export type TriggerNode = {
  id: string;
  kind: TriggerKind;
  /** Every block has an optional description in the draft PRD. */
  description: string;
  settings: TriggerSettings;
};

export type TriggerOutput = {
  name: string;
  label: string;
  payloadKind: PayloadKind;
  array: boolean;
};

export type TriggerDefinition = {
  kind: TriggerKind;
  title: string;
  icon: IconName;
  /** True for triggers `main` has no backend for. */
  mock: boolean;
  /** The trigger's fields, which can fill Start's inputs. */
  outputs: TriggerOutput[];
  defaults: () => TriggerSettings;
};

export const triggerDefinitions: Record<TriggerKind, TriggerDefinition> = {
  entityCreated: {
    kind: "entityCreated",
    title: "Entity created",
    icon: "cube",
    mock: true,
    outputs: [
      {
        name: "entity",
        label: "Entity",
        payloadKind: "EntityId",
        array: false,
      },
      {
        name: "linkedEntities",
        label: "Linked entities",
        payloadKind: "EntityId",
        array: true,
      },
      {
        name: "createdBy",
        label: "Created by",
        payloadKind: "EntityId",
        array: false,
      },
      {
        name: "createdAt",
        label: "Created at",
        payloadKind: "DateTime",
        array: false,
      },
    ],
    defaults: () => ({ condition: "" }),
  },
  entityUpdated: {
    kind: "entityUpdated",
    title: "Entity updated",
    icon: "pencil",
    mock: true,
    outputs: [
      {
        name: "entity",
        label: "Entity",
        payloadKind: "EntityId",
        array: false,
      },
      {
        name: "linkedEntities",
        label: "Linked entities",
        payloadKind: "EntityId",
        array: true,
      },
      {
        name: "updatedBy",
        label: "Updated by",
        payloadKind: "EntityId",
        array: false,
      },
      {
        name: "updatedAt",
        label: "Updated at",
        payloadKind: "DateTime",
        array: false,
      },
    ],
    defaults: () => ({ propertiesToWatch: [], condition: "" }),
  },
  schedule: {
    kind: "schedule",
    title: "Recurring schedule",
    icon: "calendarClock",
    mock: false,
    outputs: [
      {
        name: "scheduledFor",
        label: "Scheduled for",
        payloadKind: "DateTime",
        array: false,
      },
      {
        name: "runNumber",
        label: "Run number",
        payloadKind: "Number",
        array: false,
      },
    ],
    defaults: () => ({
      spec: {
        type: "cron",
        cronExpression: "0 9 1 * *",
        timezone: "Europe/London",
      },
    }),
  },
  webhook: {
    kind: "webhook",
    title: "Webhook received",
    icon: "plug",
    mock: true,
    outputs: [
      { name: "body", label: "Body", payloadKind: "Text", array: false },
      {
        name: "receivedAt",
        label: "Received at",
        payloadKind: "DateTime",
        array: false,
      },
    ],
    defaults: () => ({
      webhookUrl: `https://app.hash.ai/api/flows/hooks/${Math.random().toString(36).slice(2, 10)}`,
    }),
  },
};

export const triggerKinds = Object.keys(triggerDefinitions) as TriggerKind[];

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

export const weekdays = [
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
  switch (repeat) {
    case "day":
      return `Every day at ${time}`;
    case "week":
      return `Every ${weekdays[dayOfWeek] ?? "Monday"} at ${time}`;
    case "month":
      return `At ${time} on the ${ordinal(dayOfMonth)} of every month`;
  }
};
