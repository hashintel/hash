import { formatScheduleSpec } from "../../../../../../shared/use-flow-schedules";

import type { EntityId } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { ScheduleSpec } from "@local/hash-isomorphic-utils/flows/schedule-types";
import type { Simplified } from "@local/hash-isomorphic-utils/simplify-properties";
import type { FlowSchedule } from "@local/hash-isomorphic-utils/system-types/flowschedule";

/** What can start a run of a flow. Every flow can be run by hand, so Manual is always on. */
export type TriggerKind = "manual" | "schedule";

/** One of the flow's schedules, as the triggers panel lists it. */
export type TriggerRow = {
  entityId: EntityId;
  /** The trigger's name, or else when it runs, in words. */
  text: string;
  /** Whether it's on, rather than paused. */
  on: boolean;
};

export const toScheduleTriggerRow = (
  schedule: Simplified<HashEntity<FlowSchedule>>,
): TriggerRow => {
  const { name, scheduleSpec, scheduleStatus } = schedule.properties;

  return {
    entityId: schedule.metadata.recordId.entityId,
    text:
      name.trim() === ""
        ? formatScheduleSpec(scheduleSpec as ScheduleSpec)
        : name,
    on: scheduleStatus === "active",
  };
};

/** What the Schedule card says under its title: e.g. "2 on · 1 paused", leaving out a part that's zero. */
export const getScheduleSummary = (schedules: TriggerRow[]) => {
  if (schedules.length === 0) {
    return "None";
  }

  const on = schedules.filter((schedule) => schedule.on).length;
  const paused = schedules.length - on;

  return [on > 0 ? `${on} on` : null, paused > 0 ? `${paused} paused` : null]
    .filter((part) => part !== null)
    .join(" · ");
};

export type TriggerState = "all" | "on" | "paused";

/** Which triggers to show: those in the state, whose text has the search term in it, ignoring case. */
export type TriggerFilters = { state: TriggerState; search: string };

export const filterTriggerRows = (
  rows: TriggerRow[],
  { state, search }: TriggerFilters,
) => {
  const term = search.trim().toLowerCase();

  return rows.filter(
    (row) =>
      (state === "all" || (state === "on") === row.on) &&
      row.text.toLowerCase().includes(term),
  );
};
