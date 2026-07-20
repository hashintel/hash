import { describe, expect, it } from "vitest";

import {
  filterOrderLines,
  recomputeOrderTimelines,
} from "./recompute-order-timelines";

import type { OrderLineRow } from "../../shared/types";

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
  });
});
