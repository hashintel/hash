import { getFlowInputLabel } from "../../@/[shortname]/flows/[flow-def-id]/edit.page/shared/value-display";
import {
  getFlowInputValues,
  getUnfillableInputProblem,
} from "../../@/[shortname]/flows/[flow-def-id]/edit.page/top-bar/run-flow/run-form";
import {
  parseCronExpression,
  toCronExpression,
} from "../../shared/schedule-repeat";

import type { RunFormValues } from "../../@/[shortname]/flows/[flow-def-id]/edit.page/top-bar/run-flow/run-form";
import type { RepeatRule, ScheduleTime } from "../../shared/schedule-repeat";
import type { EntityId, WebId } from "@blockprotocol/type-system";
import type { ScheduleSpec } from "@local/hash-isomorphic-utils/flows/schedule-types";
import type { FlowInputDefinition } from "@local/hash-isomorphic-utils/flows/types";

/** A rule the form makes, or a spec it can't, e.g. an interval, kept until another repeat is chosen. */
type RepeatChoice =
  | { kind: "rule"; rule: RepeatRule }
  | { kind: "kept"; scheduleSpec: ScheduleSpec };

/** When the trigger runs, which both adding and editing one sets. `time` is used only with a rule. */
export type ScheduleFormValues = {
  repeat: RepeatChoice;
  time: ScheduleTime;
  timeZone: string;
};

export type NewTriggerFormValues = ScheduleFormValues & {
  flowEntityId: EntityId | null;
  /** The web the flow runs in, or `null` until one is chosen. */
  webId: WebId | null;
  name: string;
  /** Whether the flow runs once when the trigger is added, as well as on its schedule. */
  runNow: boolean;
  inputValues: RunFormValues;
};

/** The time a rule starts at when a schedule has none to keep. */
export const defaultScheduleTime: ScheduleTime = { hour: 9, minute: 0 };

/**
 * A schedule's spec as the form's values. A cron expression without a time zone runs in UTC, as Temporal runs it, while
 * an interval has none, so choosing a rule for it starts in `fallbackTimeZone`.
 */
export const toScheduleFormValues = (
  scheduleSpec: ScheduleSpec,
  fallbackTimeZone: string,
): ScheduleFormValues => {
  if (scheduleSpec.type === "interval") {
    return {
      repeat: { kind: "kept", scheduleSpec },
      time: defaultScheduleTime,
      timeZone: fallbackTimeZone,
    };
  }

  const parsed = parseCronExpression(scheduleSpec.cronExpression);
  const timeZone = scheduleSpec.timezone ?? "UTC";

  return parsed
    ? {
        repeat: { kind: "rule", rule: parsed.rule },
        time: parsed.time,
        timeZone,
      }
    : {
        repeat: { kind: "kept", scheduleSpec },
        time: defaultScheduleTime,
        timeZone,
      };
};

/** The spec the form's values give: a rule's cron expression at the time, or the kept spec, in the time zone if it has one. */
export const toScheduleSpec = ({
  repeat,
  time,
  timeZone,
}: ScheduleFormValues): ScheduleSpec => {
  if (repeat.kind === "rule") {
    return {
      type: "cron",
      cronExpression: toCronExpression(repeat.rule, time),
      timezone: timeZone,
    };
  }

  return repeat.scheduleSpec.type === "cron"
    ? { ...repeat.scheduleSpec, timezone: timeZone }
    : repeat.scheduleSpec;
};

/**
 * Why the schedule can't be saved, or `null` if it can: a weekly rule with no days, or no runs to come, e.g. once today
 * at a time already past. `nextRuns` is `null` when they aren't known, which doesn't stop it.
 */
export const getScheduleBlocker = (
  { repeat }: ScheduleFormValues,
  nextRuns: Date[] | null,
): string | null => {
  if (
    repeat.kind === "rule" &&
    repeat.rule.kind === "weekly" &&
    repeat.rule.weekdays.length === 0
  ) {
    return "Choose the days it repeats on";
  }

  if (nextRuns?.length === 0) {
    return "It wouldn't run again: choose a later time";
  }

  return null;
};

/**
 * Why a trigger can't be added yet, or `null` if it can: no flow or name, a schedule that can't be saved, or a required
 * input of the flow that's blank or can't be given here. `inputs` is `null` while the flow's aren't known.
 */
export const getNewTriggerBlocker = (
  values: NewTriggerFormValues,
  inputs: FlowInputDefinition[] | null,
  nextRuns: Date[] | null,
): string | null => {
  if (values.flowEntityId === null || inputs === null) {
    return "Choose a flow";
  }

  if (values.name.trim() === "") {
    return "Name the trigger";
  }

  const scheduleBlocker = getScheduleBlocker(values, nextRuns);

  if (scheduleBlocker !== null) {
    return scheduleBlocker;
  }

  const unfillable = getUnfillableInputProblem(inputs);

  if (unfillable !== null) {
    return unfillable;
  }

  const { missingInputNames } = getFlowInputValues(inputs, values.inputValues);

  return missingInputNames.length > 0
    ? `Fill in ${inputs
        .filter((input) => missingInputNames.includes(input.name))
        .map((input) => getFlowInputLabel(input))
        .join(", ")}`
    : null;
};
