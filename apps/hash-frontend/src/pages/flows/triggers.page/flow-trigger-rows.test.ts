import { describe, expect, it } from "vitest";

import {
  filterFlowTriggerRows,
  sortFlowTriggerRows,
  toFlowTriggerRow,
} from "./flow-trigger-rows";

import type { FlowTriggerRow } from "./flow-trigger-rows";
import type { EntityId, WebId } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { Simplified } from "@local/hash-isomorphic-utils/simplify-properties";
import type { FlowSchedule } from "@local/hash-isomorphic-utils/system-types/flowschedule";

const webA = "0b5a5c4c-6d4d-4cd8-9d5e-2f2b0f7a6a11" as WebId;
const webB = "1c6b6d5d-7e5e-4de9-8e6f-3a3c1a8b7b22" as WebId;
const scheduleEntityId =
  `${webA}~7f9d2b1e-3c4a-4e5f-8a6b-9c0d1e2f3a4b` as EntityId;
const flowA = `${webA}~aaaaaaaa-1111-4111-8111-111111111111` as EntityId;
const flowB = `${webB}~bbbbbbbb-2222-4222-8222-222222222222` as EntityId;

const schedule = (properties: Record<string, unknown>) =>
  ({
    metadata: { recordId: { entityId: scheduleEntityId } },
    properties: {
      name: "Weekly supplier check",
      scheduleSpec: { type: "interval", intervalMs: 600_000 },
      scheduleOverlapPolicy: "CANCEL_OTHER",
      ...properties,
    },
  }) as unknown as Simplified<HashEntity<FlowSchedule>>;

const pauseState = (explanation?: string) => ({
  "https://hash.ai/@h/types/property-type/paused-at/": "2026-11-19T10:00:00Z",
  ...(explanation === undefined
    ? {}
    : { "https://hash.ai/@h/types/property-type/explanation/": explanation }),
});

let rowCount = 0;

const row = (fields: Partial<FlowTriggerRow>): FlowTriggerRow => {
  rowCount += 1;

  return {
    entityId:
      `${webA}~00000000-0000-4000-8000-${String(rowCount).padStart(12, "0")}` as EntityId,
    text: "Every 10 minutes",
    on: true,
    scheduleText: null,
    pauseNote: null,
    flowEntityId: flowA,
    flowName: "Supplier review",
    webId: webA,
    webName: "@aakarsh",
    ...fields,
  };
};

describe("toFlowTriggerRow", () => {
  it("shows a schedule by its name with when it runs under it, with its flow and web", () => {
    expect(
      toFlowTriggerRow({
        schedule: schedule({ scheduleStatus: "active" }),
        flow: { entityId: flowB, name: "Monthly report" },
        webName: "@aakarsh",
      }),
    ).toEqual({
      entityId: scheduleEntityId,
      text: "Weekly supplier check",
      on: true,
      scheduleText: "Every 10 minutes",
      pauseNote: null,
      flowEntityId: flowB,
      flowName: "Monthly report",
      /* The schedule's web, which needn't be its flow's. */
      webId: webA,
      webName: "@aakarsh",
    });
  });

  it("shows a schedule with a blank name only by when it runs", () => {
    expect(
      toFlowTriggerRow({
        schedule: schedule({ name: "  ", scheduleStatus: "active" }),
        flow: { entityId: flowA, name: "Supplier review" },
        webName: "@aakarsh",
      }),
    ).toMatchObject({ text: "Every 10 minutes", scheduleText: null });
  });

  it("gives a paused schedule's note, and none for a blank one or one that's on again", () => {
    const rowOf = (properties: Record<string, unknown>) =>
      toFlowTriggerRow({
        schedule: schedule(properties),
        flow: { entityId: flowA, name: "Supplier review" },
        webName: "@aakarsh",
      });

    expect(
      rowOf({
        scheduleStatus: "paused",
        schedulePauseState: pauseState(" Its flow was archived "),
      }),
    ).toMatchObject({ on: false, pauseNote: "Its flow was archived" });
    expect(
      rowOf({ scheduleStatus: "paused", schedulePauseState: pauseState("  ") })
        .pauseNote,
    ).toBeNull();
    expect(
      rowOf({
        scheduleStatus: "active",
        schedulePauseState: pauseState("Paused for the holidays"),
      }).pauseNote,
    ).toBeNull();
  });

  it("keeps the flow to filter by when its name is empty or can't be read", () => {
    const toRow = (
      flow: { entityId: EntityId; name: string | null } | undefined,
    ) =>
      toFlowTriggerRow({
        schedule: schedule({ scheduleStatus: "active" }),
        flow,
        webName: "",
      });

    expect(toRow({ entityId: flowB, name: "" })).toMatchObject({
      flowEntityId: flowB,
      flowName: "",
    });
    expect(toRow({ entityId: flowB, name: null })).toMatchObject({
      flowEntityId: flowB,
      flowName: null,
    });
    expect(toRow(undefined)).toMatchObject({
      flowEntityId: null,
      flowName: null,
    });
  });
});

describe("filterFlowTriggerRows", () => {
  const rows = [
    row({ text: "Every 10 minutes", flowName: "Supplier review" }),
    row({
      text: "Monthly report run",
      scheduleText: "Every 2 hours",
      on: false,
      flowEntityId: flowB,
      flowName: "Monthly report",
      webId: webB,
      webName: "@acme",
    }),
    row({ text: "Every 1 day", on: false, flowName: "Supplier review" }),
  ];
  const noFilters = {
    search: "",
    flowEntityId: null,
    webId: null,
  } as const;

  const textsOf = (filtered: FlowTriggerRow[]) =>
    filtered.map(({ text }) => text);

  it("keeps only the triggers of the flow, and those in the web", () => {
    expect(
      textsOf(
        filterFlowTriggerRows(rows, { ...noFilters, flowEntityId: flowA }),
      ),
    ).toEqual(["Every 10 minutes", "Every 1 day"]);
    expect(
      textsOf(filterFlowTriggerRows(rows, { ...noFilters, webId: webB })),
    ).toEqual(["Monthly report run"]);
  });

  it("matches the search in the trigger's name, its schedule, its flow's name or its web's, ignoring case and spaces", () => {
    expect(
      textsOf(filterFlowTriggerRows(rows, { ...noFilters, search: " HOURS " })),
    ).toEqual(["Monthly report run"]);
    expect(
      textsOf(
        filterFlowTriggerRows(rows, { ...noFilters, search: "supplier" }),
      ),
    ).toEqual(["Every 10 minutes", "Every 1 day"]);
    expect(
      textsOf(filterFlowTriggerRows(rows, { ...noFilters, search: "@acme" })),
    ).toEqual(["Monthly report run"]);
  });

  it("applies every filter together", () => {
    expect(
      textsOf(
        filterFlowTriggerRows(rows, {
          search: "day",
          flowEntityId: flowA,
          webId: webA,
        }),
      ),
    ).toEqual(["Every 1 day"]);
  });
});

describe("sortFlowTriggerRows", () => {
  const rows = [
    row({ text: "Every 2 hours", flowName: "Supplier review", on: false }),
    row({ text: "Every 1 day", flowName: "Monthly report", webName: "@zed" }),
    row({ text: "Every 10 minutes", flowName: "Supplier review" }),
    row({
      text: "Every 3 days",
      flowName: "Audit",
      on: false,
      webName: "@acme",
    }),
  ];

  const order = (sorted: FlowTriggerRow[]) =>
    sorted.map(({ flowName, text }) => `${flowName}: ${text}`);

  it("sorts by flow, breaking ties by trigger", () => {
    expect(
      order(sortFlowTriggerRows(rows, { key: "flow", direction: "ASCENDING" })),
    ).toEqual([
      "Audit: Every 3 days",
      "Monthly report: Every 1 day",
      "Supplier review: Every 10 minutes",
      "Supplier review: Every 2 hours",
    ]);
  });

  it("reverses only the sorted column, so ties stay in ascending order", () => {
    expect(
      order(
        sortFlowTriggerRows(rows, { key: "flow", direction: "DESCENDING" }),
      ),
    ).toEqual([
      "Supplier review: Every 10 minutes",
      "Supplier review: Every 2 hours",
      "Monthly report: Every 1 day",
      "Audit: Every 3 days",
    ]);
  });

  it("puts triggers that are on first, sorting by status, and last when that's reversed", () => {
    expect(
      order(
        sortFlowTriggerRows(rows, { key: "status", direction: "ASCENDING" }),
      ),
    ).toEqual([
      "Monthly report: Every 1 day",
      "Supplier review: Every 10 minutes",
      "Audit: Every 3 days",
      "Supplier review: Every 2 hours",
    ]);
    expect(
      order(
        sortFlowTriggerRows(rows, { key: "status", direction: "DESCENDING" }),
      ),
    ).toEqual([
      "Audit: Every 3 days",
      "Supplier review: Every 2 hours",
      "Monthly report: Every 1 day",
      "Supplier review: Every 10 minutes",
    ]);
  });
});
