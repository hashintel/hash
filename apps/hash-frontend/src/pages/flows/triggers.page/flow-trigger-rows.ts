import { extractWebIdFromEntityId } from "@blockprotocol/type-system";

import { toScheduleTriggerRow } from "../../@/[shortname]/flows/[flow-def-id]/edit.page/shared/flow-triggers";
import { formatScheduleSpec } from "../../shared/use-flow-schedules";

import type { TriggerRow } from "../../@/[shortname]/flows/[flow-def-id]/edit.page/shared/flow-triggers";
import type { ScheduledFlow } from "../../shared/use-flow-schedules";
import type { EntityId, WebId } from "@blockprotocol/type-system";
import type { SortDirection } from "@hashintel/ds-components";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { ScheduleSpec } from "@local/hash-isomorphic-utils/flows/schedule-types";
import type { Simplified } from "@local/hash-isomorphic-utils/simplify-properties";
import type { FlowSchedule } from "@local/hash-isomorphic-utils/system-types/flowschedule";

export type FlowTriggerRow = TriggerRow & {
  /** When it runs, shown under its name, or `null` when `text` already says so. */
  scheduleText: string | null;
  pauseNote: string | null;
  /** `null` when the schedule links to no flow. */
  flowEntityId: EntityId | null;
  /** `null` when the user can't read the flow. */
  flowName: string | null;
  webId: WebId;
  /** e.g. "@aakarsh", or "" while it isn't known. */
  webName: string;
};

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
    flowEntityId: flow?.entityId ?? null,
    flowName: flow?.name ?? null,
    webId: extractWebIdFromEntityId(entityId),
    webName,
  };
};

export type FlowTriggerFilters = {
  search: string;
  flowEntityId: EntityId | null;
  webId: WebId | null;
};

/** The search matches the trigger's name, its schedule, its flow's name or its web's, ignoring case. */
export const filterFlowTriggerRows = (
  rows: FlowTriggerRow[],
  { search, flowEntityId, webId }: FlowTriggerFilters,
) => {
  const term = search.trim().toLowerCase();

  return rows.filter(
    (row) =>
      (flowEntityId === null || row.flowEntityId === flowEntityId) &&
      (webId === null || row.webId === webId) &&
      [row.text, row.scheduleText ?? "", row.flowName ?? "", row.webName].some(
        (text) => text.toLowerCase().includes(term),
      ),
  );
};

export type FlowTriggerSortKey = "flow" | "trigger" | "web" | "status";

export type FlowTriggerSort = {
  key: FlowTriggerSortKey;
  direction: SortDirection;
};

const compareBy: Record<
  FlowTriggerSortKey,
  (left: FlowTriggerRow, right: FlowTriggerRow) => number
> = {
  flow: (left, right) =>
    (left.flowName ?? "").localeCompare(right.flowName ?? ""),
  trigger: (left, right) => left.text.localeCompare(right.text),
  web: (left, right) => left.webName.localeCompare(right.webName),
  /* On before Paused, ascending. */
  status: (left, right) => Number(right.on) - Number(left.on),
};

/** Ties are broken by flow, then trigger, always ascending. */
export const sortFlowTriggerRows = (
  rows: FlowTriggerRow[],
  { key, direction }: FlowTriggerSort,
) =>
  rows.toSorted(
    (left, right) =>
      (direction === "ASCENDING" ? 1 : -1) * compareBy[key](left, right) ||
      compareBy.flow(left, right) ||
      compareBy.trigger(left, right),
  );
