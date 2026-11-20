import { extractWebIdFromEntityId } from "@blockprotocol/type-system";

import { toScheduleTriggerRow } from "../../@/[shortname]/flows/[flow-def-id]/edit.page/shared/flow-triggers";
import { formatScheduleSpec } from "../../shared/use-flow-schedules";

import type {
  TriggerRow,
  TriggerState,
} from "../../@/[shortname]/flows/[flow-def-id]/edit.page/shared/flow-triggers";
import type { ScheduledFlow } from "../../shared/use-flow-schedules";
import type { EntityId, WebId } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { ScheduleSpec } from "@local/hash-isomorphic-utils/flows/schedule-types";
import type { Simplified } from "@local/hash-isomorphic-utils/simplify-properties";
import type { FlowSchedule } from "@local/hash-isomorphic-utils/system-types/flowschedule";

/** A schedule as the triggers page lists it, with the flow it starts and the web it's in. */
export type FlowTriggerRow = TriggerRow & {
  /** When it runs, in words, shown under its name, or `null` when it has none and `text` already says so. */
  scheduleText: string | null;
  /** Why it's paused, when it is and that was noted, e.g. "Its flow was archived". */
  pauseNote: string | null;
  /**
   * The flow it starts, to filter by, or `null` if the user can't read that flow: it's then listed under a name that
   * isn't its own, so it can't be told apart from other flows the user can't read.
   */
  flowEntityId: EntityId | null;
  flowName: string;
  webId: WebId;
  /** The web's shortname, e.g. "@aakarsh", or "" while it isn't known. */
  webName: string;
};

/** A schedule's row: it's shown by its name with when it runs under it, or only by when it runs if it has no name. */
export const toFlowTriggerRow = ({
  schedule,
  flow,
  webName,
}: {
  schedule: Simplified<HashEntity<FlowSchedule>>;
  flow: ScheduledFlow | undefined;
  webName: string;
}): FlowTriggerRow => {
  const { name, scheduleSpec, schedulePauseState } = schedule.properties;
  const { entityId, text, on } = toScheduleTriggerRow(schedule);
  const pauseNote =
    schedulePauseState?.[
      "https://hash.ai/@h/types/property-type/explanation/"
    ]?.trim() ?? "";

  return {
    entityId,
    text,
    on,
    scheduleText:
      name.trim() === ""
        ? null
        : formatScheduleSpec(scheduleSpec as ScheduleSpec),
    pauseNote: !on && pauseNote !== "" ? pauseNote : null,
    flowEntityId: flow?.name ? flow.entityId : null,
    flowName: flow?.name ?? "Unknown flow",
    webId: extractWebIdFromEntityId(entityId),
    webName,
  };
};

/**
 * Which triggers to show: those in the state, of the flow and web if one is picked, and with the search term in their
 * name, their schedule, their flow's name or their web's, ignoring case.
 */
export type FlowTriggerFilters = {
  state: TriggerState;
  search: string;
  flowEntityId: EntityId | null;
  webId: WebId | null;
};

export const filterFlowTriggerRows = (
  rows: FlowTriggerRow[],
  { state, search, flowEntityId, webId }: FlowTriggerFilters,
) => {
  const term = search.trim().toLowerCase();

  return rows.filter(
    (row) =>
      (state === "all" || (state === "on") === row.on) &&
      (flowEntityId === null || row.flowEntityId === flowEntityId) &&
      (webId === null || row.webId === webId) &&
      [row.text, row.scheduleText ?? "", row.flowName, row.webName].some(
        (text) => text.toLowerCase().includes(term),
      ),
  );
};

export type FlowTriggerColumn = "flow" | "trigger" | "web" | "status";

export type FlowTriggerSort = {
  column: FlowTriggerColumn;
  direction: "asc" | "desc";
};

const compareColumn: Record<
  FlowTriggerColumn,
  (left: FlowTriggerRow, right: FlowTriggerRow) => number
> = {
  flow: (left, right) => left.flowName.localeCompare(right.flowName),
  trigger: (left, right) => left.text.localeCompare(right.text),
  web: (left, right) => left.webName.localeCompare(right.webName),
  /* On before Paused, ascending. */
  status: (left, right) => Number(right.on) - Number(left.on),
};

/** Sorted by the column, then ties by flow and by trigger, ascending. */
export const sortFlowTriggerRows = (
  rows: FlowTriggerRow[],
  { column, direction }: FlowTriggerSort,
) =>
  rows.toSorted(
    (left, right) =>
      (direction === "asc" ? 1 : -1) * compareColumn[column](left, right) ||
      compareColumn.flow(left, right) ||
      compareColumn.trigger(left, right),
  );
