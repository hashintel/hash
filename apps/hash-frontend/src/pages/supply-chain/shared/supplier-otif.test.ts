import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  aggregateVendorStats,
  filterLinesByRange,
  monthlyOnTime,
  recomputeSitePerformance,
  recomputeSupplierBlock,
  worstEventsFromLines,
} from "./supplier-otif";

import type {
  ProcurementSupplierBlock,
  SiteSupplierPerformance,
  SupplierLine,
} from "./types";

function line(overrides: Partial<SupplierLine>): SupplierLine {
  return {
    vendor_id: "V1",
    vendor_name: "Vendor 1",
    matnr: "MAT-1",
    material_name: "Material 1",
    po_number: "PO-1",
    po_item: "10",
    po_date: "2026-01-01",
    promised_date: "2026-01-10",
    first_gr_date: "2026-01-10",
    days_late: 0,
    sched_qty: 100,
    gr_qty_to_date: 100,
    ...overrides,
  };
}

describe("aggregateVendorStats", () => {
  // Default tolerances: 0 days late allowed, 5% under-fill allowed.
  const lines: SupplierLine[] = [
    line({ days_late: 0, sched_qty: 100, gr_qty_to_date: 100 }), // OTIF
    line({ days_late: 2, sched_qty: 100, gr_qty_to_date: 100 }), // late, in full
    line({ days_late: 5, sched_qty: 100, gr_qty_to_date: 90 }), // late, short
    line({ days_late: -1, sched_qty: 100, gr_qty_to_date: 100 }), // early, OTIF
  ];
  const rec = aggregateVendorStats(lines, "V1", "Vendor 1");

  it("counts lines and lateness", () => {
    expect(rec.n_lines).toBe(4);
    expect(rec.n_late).toBe(2);
    expect(rec.max_days_late).toBe(5);
  });

  it("computes on-time / in-full / OTIF percentages against tolerances", () => {
    expect(rec.on_time_pct).toBe(50);
    expect(rec.in_full_pct).toBe(75);
    expect(rec.otif_pct).toBe(50);
  });

  it("computes conditional and unconditional lateness + fill rate", () => {
    expect(rec.mean_days_late_all).toBe(1.5);
    expect(rec.mean_days_late_when_late).toBe(3.5);
    expect(rec.median_days_late_when_late).toBe(3.5);
    expect(rec.fill_rate_pct).toBe(97.5);
  });

  it("buckets lateness severity", () => {
    expect(rec.late_buckets).toEqual({
      ge_1d_pct: 50,
      ge_3d_pct: 25,
      ge_7d_pct: 0,
      ge_14d_pct: 0,
    });
  });
});

describe("monthlyOnTime", () => {
  it("buckets on-time share per month, sorted ascending", () => {
    const lines: SupplierLine[] = [
      line({ first_gr_date: "2026-01-05", days_late: 0 }),
      line({ first_gr_date: "2026-01-20", days_late: 4 }),
      line({ first_gr_date: "2026-02-02", days_late: 0 }),
    ];

    expect(monthlyOnTime(lines)).toEqual([
      { month: "2026-01", n: 2, on_time_pct: 50 },
      { month: "2026-02", n: 1, on_time_pct: 100 },
    ]);
  });
});

describe("worstEventsFromLines", () => {
  it("returns the N latest events worst-first", () => {
    const lines: SupplierLine[] = [
      line({ days_late: 1 }),
      line({ days_late: 9 }),
      line({ days_late: 4 }),
      line({ days_late: 0 }),
    ];

    const worst = worstEventsFromLines(lines, 2);
    expect(worst.map((event) => event.days_late)).toEqual([9, 4]);
  });
});

describe("filterLinesByRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("keeps lines on/after the cutoff and drops those without a GR date", () => {
    const lines: SupplierLine[] = [
      line({ first_gr_date: "2026-05-01" }),
      line({ first_gr_date: "2026-01-01" }),
      line({ first_gr_date: null }),
    ];

    const out = filterLinesByRange(lines, "3m"); // cutoff 2026-03
    expect(out.map((line2) => line2.first_gr_date)).toEqual(["2026-05-01"]);
  });
});

describe("supplier line materialisation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  const rawLines: SupplierLine[] = [
    line({
      vendor_id: "V1",
      vendor_name: "Vendor 1",
      matnr: "MAT-1",
      material_name: "Material 1",
      first_gr_date: "2026-05-01",
      days_late: 0,
      sched_qty: 100,
      gr_qty_to_date: 100,
    }),
    line({
      vendor_id: "V1",
      vendor_name: "Vendor 1",
      matnr: "MAT-2",
      material_name: "Material 2",
      first_gr_date: "2026-05-12",
      days_late: 3,
      sched_qty: 100,
      gr_qty_to_date: 90,
    }),
    line({
      vendor_id: "V2",
      vendor_name: "Vendor 2",
      matnr: "MAT-1",
      material_name: "Material 1",
      first_gr_date: "2026-01-10",
      days_late: 8,
      sched_qty: 100,
      gr_qty_to_date: 100,
    }),
  ];

  it("materialises site vendor monthly, worst events, and materials from raw lines", () => {
    const perf: SiteSupplierPerformance = {
      schema_version: "1.1",
      generated_at: "2026-06-01T00:00:00Z",
      overall: {
        n_lines: 3,
        n_vendors: 2,
        on_time_pct: null,
        in_full_pct: null,
        otif_pct: null,
        coverage_pct: 100,
        tolerance_days: 0,
        under_tolerance_pct: 0.05,
        min_lines_for_leaderboard: 1,
      },
      vendors: [],
      lines: rawLines,
    };

    const out = recomputeSitePerformance(perf, "3m");
    expect(out.overall.n_lines).toBe(2);
    expect(out.overall.n_vendors).toBe(1);
    expect(out.vendors).toHaveLength(1);
    const vendor = out.vendors[0];
    expect(vendor).toBeDefined();
    expect(vendor!.on_time_pct).toBe(50);
    expect(vendor!.in_full_pct).toBe(50);
    expect(vendor!.otif_pct).toBe(50);
    expect(vendor!.monthly).toEqual([
      { month: "2026-05", n: 2, on_time_pct: 50 },
    ]);
    expect(vendor!.worst_events?.map((event) => event.days_late)).toEqual([3]);
    expect(
      vendor!.materials?.map((month) => [
        month.matnr,
        month.n_lines,
        month.otif_pct,
      ]),
    ).toEqual([
      ["MAT-1", 1, 100],
      ["MAT-2", 1, 0],
    ]);
  });

  it("materialises procurement supplier blocks from raw lines", () => {
    const block: ProcurementSupplierBlock = {
      primary_vendor: { id: "V1", name: "Vendor 1" },
      vendors: [],
      coverage_pct: 100,
      n_lines: rawLines.length,
      data_quality_note: null,
      tolerance_days: 0,
      under_tolerance_pct: 0.05,
      lines: rawLines,
    };

    const out = recomputeSupplierBlock(block, "12m");
    expect(out.n_lines).toBe(3);
    expect(out.worst_events?.map((event) => event.days_late)).toEqual([8, 3]);
    expect(
      out.vendors.find((value) => value.vendor_id === "V1")?.monthly,
    ).toEqual([{ month: "2026-05", n: 2, on_time_pct: 50 }]);
    expect(
      out.vendors.find((value) => value.vendor_id === "V1")?.materials,
    ).toHaveLength(2);
  });
});
