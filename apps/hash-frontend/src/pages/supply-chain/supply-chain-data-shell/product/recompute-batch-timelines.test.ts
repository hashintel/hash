import { describe, expect, it } from "vitest";

import { recomputeBatchTimelines } from "./recompute-batch-timelines";

import type { BatchRow, BatchTimelines } from "../../shared/types";

function batch(overrides: Partial<BatchRow>): BatchRow {
  return {
    batch: "B1",
    route: "direct",
    n_traced_materials: null,
    earliest_po_date: null,
    earliest_gr_date: "2026-01-01",
    earliest_production_start: null,
    fg_receipt_date: null,
    qa_release_date: null,
    delivery_date: "2026-01-10",
    delivery_source: null,
    seg_proc_to_prodstart: 0,
    seg_prodstart_to_prodfinish: 0,
    seg_prodfinish_to_qa: 0,
    seg_qa_to_customer: 0,
    total_days: null,
    total_from_po: null,
    ...overrides,
  };
}

function batchTimelines(batches: BatchRow[]): BatchTimelines {
  return {
    batches,
    per_route: {
      direct: { label: "Direct" },
    },
  };
}

describe("recomputeBatchTimelines", () => {
  it("uses per-batch total_days for route median totals", () => {
    const batches = [
      batch({
        batch: "B1",
        seg_proc_to_prodstart: 1,
        seg_prodstart_to_prodfinish: 100,
        total_days: 101,
      }),
      batch({
        batch: "B2",
        seg_proc_to_prodstart: 50,
        seg_prodstart_to_prodfinish: 50,
        total_days: 100,
      }),
      batch({
        batch: "B3",
        seg_proc_to_prodstart: 100,
        seg_prodstart_to_prodfinish: 1,
        total_days: 101,
      }),
    ];

    const { pipeline } = recomputeBatchTimelines(
      batches,
      batchTimelines(batches),
    );

    expect(pipeline.direct?.total_median).toBe(101);
    expect(pipeline.direct?.stages.map((stage) => stage.median)).toEqual([
      50, 50, 0, 0,
    ]);
  });

  it("excludes outliers from means without changing other statistics", () => {
    const durations = [10, 11, 12, 13, 14, 15, 16, 17, 100];
    const batches = durations.map((duration, index) =>
      batch({
        batch: `B${index + 1}`,
        seg_proc_to_prodstart: duration,
        total_days: duration,
      }),
    );

    const { timelines, pipeline } = recomputeBatchTimelines(
      batches,
      batchTimelines(batches),
      true,
    );

    expect(timelines.segments?.seg_proc_to_prodstart).toMatchObject({
      mean: 13.5,
      median: 14,
      p25: 12,
      p75: 16,
      n: 9,
    });
    expect(pipeline.direct?.stages[0]).toMatchObject({
      mean: 13.5,
      median: 14,
    });
    expect(pipeline.direct?.total_mean).toBe(13.5);
    expect(pipeline.direct?.total_median).toBe(14);
  });
});
