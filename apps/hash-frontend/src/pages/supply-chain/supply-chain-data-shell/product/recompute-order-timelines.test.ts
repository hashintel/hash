import { describe, expect, it } from "vitest";

import {
  filterOrderLines,
  filterOrderLinesByRoute,
  recomputeOrderTimelines,
} from "./recompute-order-timelines";

import type { BatchRow, OrderLineRow } from "../../shared/types";

const line = (
  dispatchDate: string,
  fulfilment: OrderLineRow["fulfilment"],
  mtoPegged = false,
): OrderLineRow => ({
  sales_order: dispatchDate,
  so_item: "10",
  customer: "Example",
  country: "GB",
  order_created: "2025-01-01",
  delivery_created: "2025-01-11",
  dispatch_date: dispatchDate,
  n_deliveries: 1,
  order_qty: 10,
  delivered_qty: 10,
  batches: [],
  batch_available: null,
  fulfilment,
  mto_pegged: mtoPegged,
  seg_order_to_delivery: 10,
  seg_delivery_to_dispatch: 5,
  total_days: 15,
});

describe("customer-order recomputation", () => {
  it("filters on goods-issue month", () => {
    const recent = line("2026-06-01", "from_stock");
    const old = line("2024-01-01", "from_stock");

    expect(filterOrderLines([recent, old], "12m")).toEqual([recent]);
  });

  it("builds percentile stages and fulfilment shares", () => {
    const result = recomputeOrderTimelines(
      [
        line("2026-06-01", "from_stock"),
        line("2026-06-02", "awaited_production", true),
      ],
      "12m",
    );

    expect(result.pipeline.orders?.stages[0]).toMatchObject({
      p75: 10,
      p95: 10,
    });
    expect(result.shares).toMatchObject({
      n: 2,
      fromStockPct: 50,
      awaitedProductionPct: 50,
      mtoPeggedPct: 50,
    });
    expect(result.statistics).toMatchObject({
      averageBatchesPerOrder: null,
      averageOrderVolume: 10,
      openOrderCount: null,
    });
  });

  it("computes total percentiles from complete order durations", () => {
    const result = recomputeOrderTimelines(
      [
        {
          ...line("2026-06-01", "from_stock"),
          seg_order_to_delivery: 0,
          seg_delivery_to_dispatch: 100,
          total_days: 100,
        },
        {
          ...line("2026-06-02", "from_stock"),
          seg_order_to_delivery: 100,
          seg_delivery_to_dispatch: 0,
          total_days: 100,
        },
        {
          ...line("2026-06-03", "from_stock"),
          seg_order_to_delivery: 100,
          seg_delivery_to_dispatch: 100,
          total_days: 100,
        },
      ],
      "12m",
    );

    expect(result.pipeline.orders?.total_p75).toBe(100);
    expect(result.pipeline.orders?.total_p95).toBe(100);
    expect(result.pipeline.orders?.total_mean).toBe(100);
    expect(result.pipeline.orders?.total_median).toBe(100);
    expect(
      result.pipeline.orders?.stages.reduce(
        (total, stage) => total + (stage.p75 ?? 0),
        0,
      ),
    ).toBe(200);
  });

  it("aggregates volume across lines before averaging orders", () => {
    const firstLine = {
      ...line("2026-06-01", "from_stock"),
      sales_order: "100",
      delivered_qty: 10,
      delivered_qty_uom: "KG",
    };
    const secondLine = {
      ...line("2026-06-02", "from_stock"),
      sales_order: "100",
      so_item: "20",
      delivered_qty: 15,
      delivered_qty_uom: "KG",
    };
    const otherOrder = {
      ...line("2026-06-03", "from_stock"),
      sales_order: "200",
      delivered_qty: 20,
      delivered_qty_uom: "KG",
    };

    const result = recomputeOrderTimelines(
      [firstLine, secondLine, otherOrder],
      "12m",
    );

    expect(result.statistics?.averageOrderVolume).toBe(22.5);
    expect(result.statistics?.averageOrderVolumeUnit).toBe("KG");
  });

  it("does not aggregate order volumes with mixed delivery units", () => {
    const result = recomputeOrderTimelines(
      [
        {
          ...line("2026-06-01", "from_stock"),
          delivered_qty_uom: "KG",
        },
        {
          ...line("2026-06-02", "from_stock"),
          delivered_qty_uom: "L",
        },
      ],
      "12m",
    );

    expect(result.statistics?.averageOrderVolume).toBeNull();
    expect(result.statistics?.averageOrderVolumeUnit).toBeNull();
  });

  it("retains open-order statistics without dispatched lines", () => {
    const result = recomputeOrderTimelines(
      [],
      "12m",
      false,
      undefined,
      ["2026-05-01"],
      "2026-06-01",
      undefined,
      1,
    );

    expect(result.shares).toBeNull();
    expect(result.statistics).toMatchObject({
      openOrderCount: 1,
      openMedianAgeDays: 31,
    });
  });

  it("scopes delivered lines to the selected route", () => {
    const directLine = {
      ...line("2026-06-01", "from_stock"),
      route: "direct",
      batches: ["B-1"],
    };
    const hubLine = {
      ...line("2026-06-02", "from_stock"),
      sales_order: "200",
      route: "hub",
      batches: ["B-2"],
    };
    const mixedDirectPortion = {
      ...line("2026-06-03", "from_stock"),
      sales_order: "300",
      route: "direct",
      batches: ["B-1"],
    };
    const mixedHubPortion = {
      ...line("2026-06-04", "from_stock"),
      sales_order: "300",
      route: "hub",
      batches: ["B-2"],
    };
    const batches: BatchRow[] = [
      {
        batch: "B-1",
        // A batch-level representative route may differ when the same batch
        // also supplied a later hub delivery.
        route: "hub",
        n_traced_materials: 1,
        earliest_po_date: null,
        earliest_gr_date: null,
        earliest_production_start: null,
        fg_receipt_date: null,
        qa_release_date: null,
        delivery_date: "2026-06-01",
        delivery_source: "LIPS",
        seg_proc_to_prodstart: 0,
        seg_prodstart_to_prodfinish: 0,
        seg_prodfinish_to_qa: 0,
        seg_qa_to_customer: 0,
        total_days: 0,
        total_from_po: null,
      },
      {
        batch: "B-2",
        route: "hub",
        n_traced_materials: 1,
        earliest_po_date: null,
        earliest_gr_date: null,
        earliest_production_start: null,
        fg_receipt_date: null,
        qa_release_date: null,
        delivery_date: "2026-06-02",
        delivery_source: "LIPS",
        seg_proc_to_prodstart: 0,
        seg_prodstart_to_prodfinish: 0,
        seg_prodfinish_to_qa: 0,
        seg_qa_to_customer: 0,
        total_days: 0,
        total_from_po: null,
      },
    ];

    expect(
      filterOrderLinesByRoute(
        [directLine, hubLine, mixedDirectPortion, mixedHubPortion],
        "direct",
        batches,
      ),
    ).toEqual([directLine, mixedDirectPortion]);
    expect(
      recomputeOrderTimelines(
        [directLine, hubLine],
        "12m",
        false,
        {
          batches,
          per_route: {},
          coverage: { traced: 2, total: 2 },
          segments: {},
        },
        [],
        null,
        "direct",
      ).shares?.n,
    ).toBe(1);
  });

  it("uses the selected route's batch availability for wait statistics", () => {
    const directOrderLine: OrderLineRow = {
      ...line("2026-06-01", "awaited_production"),
      route: "direct",
      batches: ["B-1", "B-3"],
      batch_available: "2026-06-01",
      order_created: "2026-05-01",
    };
    const hubOrderLine: OrderLineRow = {
      ...directOrderLine,
      sales_order: "200",
      route: "hub",
      batches: ["B-2"],
    };
    const batches: BatchRow[] = [
      {
        batch: "B-1",
        route: "direct",
        n_traced_materials: 1,
        earliest_po_date: null,
        earliest_gr_date: null,
        earliest_production_start: "2026-05-10",
        fg_receipt_date: "2026-05-20",
        qa_release_date: "2026-05-25",
        delivery_date: "2026-06-01",
        delivery_source: "LIPS",
        seg_proc_to_prodstart: 0,
        seg_prodstart_to_prodfinish: 0,
        seg_prodfinish_to_qa: 0,
        seg_qa_to_customer: 0,
        total_days: 0,
        total_from_po: null,
      },
      {
        batch: "B-2",
        route: "hub",
        n_traced_materials: 1,
        earliest_po_date: null,
        earliest_gr_date: null,
        earliest_production_start: "2026-05-10",
        fg_receipt_date: "2026-06-10",
        qa_release_date: "2026-06-15",
        delivery_date: "2026-06-01",
        delivery_source: "LIPS",
        seg_proc_to_prodstart: 0,
        seg_prodstart_to_prodfinish: 0,
        seg_prodfinish_to_qa: 0,
        seg_qa_to_customer: 0,
        total_days: 0,
        total_from_po: null,
      },
      {
        batch: "B-3",
        route: "direct",
        n_traced_materials: 1,
        earliest_po_date: null,
        earliest_gr_date: null,
        earliest_production_start: "2026-05-10",
        fg_receipt_date: "2026-06-01",
        qa_release_date: "2026-06-05",
        delivery_date: "2026-06-10",
        delivery_source: "LIPS",
        seg_proc_to_prodstart: 0,
        seg_prodstart_to_prodfinish: 0,
        seg_prodfinish_to_qa: 0,
        seg_qa_to_customer: 0,
        total_days: 0,
        total_from_po: null,
      },
    ];

    const directStats = recomputeOrderTimelines(
      [directOrderLine, hubOrderLine],
      "12m",
      false,
      {
        batches,
        per_route: {},
        coverage: { traced: 2, total: 2 },
        segments: {},
      },
      [],
      null,
      "direct",
    ).statistics;
    const hubStats = recomputeOrderTimelines(
      [directOrderLine, hubOrderLine],
      "12m",
      false,
      {
        batches,
        per_route: {},
        coverage: { traced: 2, total: 2 },
        segments: {},
      },
      [],
      null,
      "hub",
    ).statistics;

    expect(directStats?.awaitedProductionWaitMedianDays).toBe(35);
    expect(hubStats?.awaitedProductionWaitMedianDays).toBe(45);
    expect(directStats?.averageBatchesPerOrder).toBe(2);
    expect(hubStats?.averageBatchesPerOrder).toBe(1);
  });
});
