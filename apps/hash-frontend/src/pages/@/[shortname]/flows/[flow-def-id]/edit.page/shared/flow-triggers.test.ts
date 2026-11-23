import { describe, expect, it } from "vitest";

import {
  filterTriggerRows,
  getScheduleSummary,
  toScheduleTriggerRow,
} from "./flow-triggers";

import type { TriggerRow } from "./flow-triggers";
import type { EntityId } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { ScheduleSpec } from "@local/hash-isomorphic-utils/flows/schedule-types";
import type { Simplified } from "@local/hash-isomorphic-utils/simplify-properties";
import type { FlowSchedule } from "@local/hash-isomorphic-utils/system-types/flowschedule";

const entityId =
  "0b5a5c4c-6d4d-4cd8-9d5e-2f2b0f7a6a11~7f9d2b1e-3c4a-4e5f-8a6b-9c0d1e2f3a4b" as EntityId;

const schedule = ({
  name,
  scheduleSpec,
  scheduleStatus,
}: {
  name: string;
  scheduleSpec: ScheduleSpec;
  scheduleStatus: "active" | "paused";
}) =>
  ({
    metadata: { recordId: { entityId } },
    properties: {
      name,
      scheduleSpec,
      scheduleStatus,
      scheduleOverlapPolicy: "CANCEL_OTHER",
    },
  }) as unknown as Simplified<HashEntity<FlowSchedule>>;

const row = (text: string, on: boolean): TriggerRow => ({
  entityId,
  text,
  on,
});

describe("toScheduleTriggerRow", () => {
  it("shows a schedule by its name, and as on while it's active", () => {
    expect(
      toScheduleTriggerRow(
        schedule({
          name: "Weekly supplier check",
          scheduleSpec: { type: "interval", intervalMs: 600_000 },
          scheduleStatus: "active",
        }),
      ),
    ).toEqual({
      entityId,
      text: "Weekly supplier check",
      on: true,
    });
  });

  it("shows a schedule with a blank name by when it runs, and as off while it's paused", () => {
    expect(
      toScheduleTriggerRow(
        schedule({
          name: "  ",
          scheduleSpec: { type: "interval", intervalMs: 7_200_000 },
          scheduleStatus: "paused",
        }),
      ),
    ).toMatchObject({ text: "Every 2 hours", on: false });
  });
});

describe("getScheduleSummary", () => {
  it("counts the schedules that are on and those that are paused, leaving out a count that's zero", () => {
    expect(
      getScheduleSummary([row("a", true), row("b", false), row("c", true)]),
    ).toBe("2 on · 1 paused");
    expect(getScheduleSummary([row("a", false)])).toBe("1 paused");
    expect(getScheduleSummary([row("a", true)])).toBe("1 on");
  });

  it("says a flow with no schedules has none", () => {
    expect(getScheduleSummary([])).toBe("None");
  });
});

describe("filterTriggerRows", () => {
  const rows = [
    row("Every Monday", true),
    row("Monthly report", false),
    row("Every Friday", false),
  ];

  const textsOf = (filtered: TriggerRow[]) => filtered.map(({ text }) => text);

  it("keeps only the triggers in the chosen state", () => {
    expect(
      textsOf(filterTriggerRows(rows, { state: "on", search: "" })),
    ).toEqual(["Every Monday"]);
    expect(
      textsOf(filterTriggerRows(rows, { state: "paused", search: "" })),
    ).toEqual(["Monthly report", "Every Friday"]);
  });

  it("matches the search anywhere in the text, ignoring case and surrounding spaces", () => {
    expect(
      textsOf(filterTriggerRows(rows, { state: "all", search: " MON " })),
    ).toEqual(["Every Monday", "Monthly report"]);
  });

  it("applies the state and the search together", () => {
    expect(
      textsOf(filterTriggerRows(rows, { state: "paused", search: "mon" })),
    ).toEqual(["Monthly report"]);
  });
});
