import { describe, expect, it } from "vitest";

import { deriveTimingFromRecords, ensureStepStats } from "./normalize-contract";

import type { DetailRows, StepDetail, StepDetailWire } from "./types";

const detailRows: DetailRows = {
  columns: [
    {
      key: "consumption_date",
      source_field: "BUDAT",
      source_table: "MKPF",
      label: "Consumption Date",
    },
    {
      key: "dwell_days",
      source_field: null,
      source_table: null,
      label: "Dwell Days",
    },
  ],

  rows: [
    { consumption_date: "2026-01-10", dwell_days: 10 },
    { consumption_date: "2026-01-20", dwell_days: 20 },
    { consumption_date: "2026-02-05", dwell_days: 30 },
  ],
};

function recordsOnlyStep(overrides: Partial<StepDetail> = {}): StepDetail {
  return {
    id: "s1",
    label: "Step",
    type: "raw_material_dwell",
    durations: [],
    observations: [],
    monthly: [],
    stats: {
      n: 0,
      mean: 0,
      median: 0,
      std: 0,
      min: 0,
      max: 0,
      p25: 0,
      p75: 0,
      p85: 0,
      p95: 0,
    },
    plan: null,
    plan_note: null,
    pct_exceeding_plan: null,
    cost: null,
    detail_rows: detailRows,
    ref_date_col: "consumption_date",
    value_col: "dwell_days",
    ...overrides,
  };
}

function recordsOnlyWireStep(
  overrides: Partial<StepDetailWire> = {},
): StepDetailWire {
  const {
    durations: _durations,
    observations: _observations,
    monthly: _monthly,
    stats: _stats,
    ...wireStep
  } = recordsOnlyStep();

  return { ...wireStep, ...overrides };
}

describe("deriveTimingFromRecords", () => {
  it("rehydrates observations/durations/monthly/stats from detail_rows", () => {
    const derived = deriveTimingFromRecords(recordsOnlyStep());
    expect(
      derived.observations.map((observation) => observation.value),
    ).toEqual([10, 20, 30]);
    expect(derived.durations).toEqual([10, 20, 30]);
    expect(derived.stats.n).toBe(3);
    expect(derived.stats.median).toBe(20);
    // Two calendar months: 2026-01 (10,20) and 2026-02 (30).
    expect(derived.monthly.map((month) => month.month)).toEqual([
      "2026-01",
      "2026-02",
    ]);
    const january = derived.monthly[0];
    const february = derived.monthly[1];
    expect(january).toBeDefined();
    expect(february).toBeDefined();
    expect(january!.n).toBe(2);
    expect(february!.median).toBe(30);
  });

  it("is a strict no-op when observations are already present", () => {
    const step = recordsOnlyStep({
      observations: [{ date: "2026-03-01", value: 99 }],
    });
    const derived = deriveTimingFromRecords(step);
    expect(derived.observations).toEqual([{ date: "2026-03-01", value: 99 }]);
    expect(derived).toBe(step);
  });

  it("is a no-op without value_col", () => {
    const step = recordsOnlyStep({ value_col: null });
    expect(deriveTimingFromRecords(step)).toBe(step);
  });

  it("ensureStepStats derives then fills stats for a records-only payload", () => {
    const out = ensureStepStats(recordsOnlyStep());
    expect(out.stats.n).toBe(3);
    expect(out.observations).toHaveLength(3);
  });

  it("accepts records-only wire payloads with omitted derived timing arrays", () => {
    const out = ensureStepStats(recordsOnlyWireStep());

    expect(out.durations).toEqual([10, 20, 30]);
    expect(out.observations).toHaveLength(3);
    expect(out.monthly.map((month) => month.month)).toEqual([
      "2026-01",
      "2026-02",
    ]);
    expect(out.stats.n).toBe(3);
  });

  it.each([
    {
      type: "transit" as const,
      dateCol: "arrival_date",
      valueCol: "transit_days",
      rows: [
        { arrival_date: "2026-01-15", transit_days: 31 },
        { arrival_date: "2026-01-18", transit_days: 9 },
      ],
    },
    {
      type: "qa_hold" as const,
      dateCol: "qa_release_date",
      valueCol: "hold_days",
      rows: [
        { qa_release_date: "2026-03-02", hold_days: 4 },
        { qa_release_date: "2026-04-12", hold_days: 8 },
      ],
    },
    {
      type: "production" as const,
      dateCol: "finish_date",
      valueCol: "production_days",
      rows: [
        { finish_date: "2026-05-01", production_days: 3 },
        { finish_date: "2026-05-06", production_days: 7 },
      ],
    },
    {
      type: "destination_dwell" as const,
      dateCol: "outbound_date",
      valueCol: "dwell_days",
      rows: [
        { outbound_date: "2026-06-01", dwell_days: 15 },
        { outbound_date: "2026-06-21", dwell_days: 25 },
      ],
    },
  ])(
    "derives representative $type records-only timing payloads",
    ({ type, dateCol, valueCol, rows }) => {
      const indexedRows = rows as Array<Record<string, string | number>>;
      const step = recordsOnlyStep({
        type,
        detail_rows: {
          columns: [
            {
              key: dateCol,
              source_field: null,
              source_table: null,
              label: dateCol,
            },
            {
              key: valueCol,
              source_field: null,
              source_table: null,
              label: valueCol,
            },
          ],

          rows: indexedRows,
        },
        ref_date_col: dateCol,
        value_col: valueCol,
      });

      const out = ensureStepStats(step);
      expect(out.observations).toEqual(
        indexedRows.map((row) => ({
          date: row[dateCol] as string,
          value: row[valueCol] as number,
        })),
      );
      expect(out.stats.n).toBe(rows.length);
      expect(out.monthly.length).toBeGreaterThan(0);
    },
  );

  it("derives procurement timing as one first/full observation per PO", () => {
    const step = recordsOnlyStep({
      type: "procurement",
      detail_rows: {
        columns: [
          {
            key: "po_number",
            source_field: null,
            source_table: null,
            label: "PO Number",
          },
          {
            key: "po_date",
            source_field: null,
            source_table: null,
            label: "PO Date",
          },
          {
            key: "first_gr_date",
            source_field: null,
            source_table: null,
            label: "First GR Date",
          },
          {
            key: "last_gr_date",
            source_field: null,
            source_table: null,
            label: "Last GR Date",
          },
          {
            key: "lead_time_days",
            source_field: null,
            source_table: null,
            label: "First Receipt (days)",
          },
        ],

        rows: [
          {
            po_number: "PO-A",
            po_date: "2026-01-01",
            first_gr_date: "2026-01-11",
            last_gr_date: "2026-01-11",
            lead_time_days: 10,
          },
          {
            po_number: "PO-A",
            po_date: "2026-01-01",
            first_gr_date: "2026-01-31",
            last_gr_date: "2026-01-31",
            lead_time_days: 30,
          },
          {
            po_number: "PO-B",
            po_date: "2026-02-01",
            first_gr_date: "2026-02-21",
            last_gr_date: "2026-03-18",
            lead_time_days: 20,
          },
        ],
      },
      ref_date_col: "first_gr_date",
      value_col: "lead_time_days",
    });

    const out = ensureStepStats(step);
    expect(out.observations).toEqual([
      { date: "2026-01-11", value: 10 },
      { date: "2026-02-21", value: 20 },
    ]);
    expect(out.complete_timing?.observations).toEqual([
      { date: "2026-01-31", value: 30 },
      { date: "2026-03-18", value: 45 },
    ]);
    expect(out.stats.n).toBe(2);
    expect(out.complete_timing?.stats.n).toBe(2);
  });

  it("derives plain procurement observations from evidence rows", () => {
    const step = recordsOnlyStep({
      type: "procurement",
      plan: 14,
      detail_rows: {
        columns: [],
        rows: [
          {
            po_number: "PO-1",
            po_date: "2026-01-01",
            first_gr_date: "2026-01-11",
            last_gr_date: "2026-01-13",
            po_item: "00010",
          },
          {
            po_number: "PO-1",
            po_item: "00020",
            po_date: "2026-01-01",
            first_gr_date: "2026-01-12",
            last_gr_date: "2026-01-13",
          },
        ],
      },
      ref_date_col: "first_gr_date",
      value_col: "lead_time_days",
    });

    const out = ensureStepStats(step);
    expect(out.observations[0]).toEqual({
      date: "2026-01-11",
      value: 10,
    });
    expect(out.complete_timing?.observations[0]).toEqual({
      date: "2026-01-13",
      value: 12,
    });
  });
});
