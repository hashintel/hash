import { describe, expect, it } from "vitest";

import { computeOrderArrivalMarkers } from "./order-arrival-markers";

import type {
  BatchRow,
  OrderLineRow,
  PipelineSummary,
} from "../../shared/types";

const batch: BatchRow = {
  batch: "B-1",
  route: "direct",
  n_traced_materials: 1,
  earliest_po_date: null,
  earliest_gr_date: "2026-01-01",
  earliest_production_start: "2026-01-11",
  fg_receipt_date: "2026-01-21",
  qa_release_date: "2026-01-26",
  delivery_date: "2026-02-05",
  delivery_source: "LIPS",
  seg_proc_to_prodstart: 10,
  seg_prodstart_to_prodfinish: 10,
  seg_prodfinish_to_qa: 5,
  seg_qa_to_customer: 10,
  total_days: 35,
  total_from_po: null,
};

const order: OrderLineRow = {
  sales_order: "100",
  so_item: "10",
  customer: "Example",
  country: "GB",
  order_created: "2026-01-16",
  delivery_created: "2026-01-25",
  dispatch_date: "2026-02-05",
  n_deliveries: 1,
  order_qty: 10,
  delivered_qty: 10,
  batches: ["b-1"],
  batch_available: "2026-01-26",
  fulfilment: "awaited_production",
  mto_pegged: false,
  seg_order_to_delivery: 9,
  seg_delivery_to_dispatch: 11,
  total_days: 20,
};

const daysBefore = (date: string, days: number): string => {
  const timestamp = Date.parse(date) - days * 86_400_000;
  return new Date(timestamp).toISOString().slice(0, 10);
};

const summary: PipelineSummary = {
  label: "Direct",
  total_mean: 35,
  total_median: 35,
  stages: [
    {
      id: "seg_proc_to_prodstart",
      label: "Procurement",
      type: "procurement",
      mean: 10,
      median: 10,
      pct_of_total: 0,
    },
    {
      id: "seg_prodstart_to_prodfinish",
      label: "Production",
      type: "production",
      mean: 10,
      median: 10,
      pct_of_total: 0,
    },
    {
      id: "seg_prodfinish_to_qa",
      label: "QA",
      type: "qa_hold",
      mean: 5,
      median: 5,
      pct_of_total: 0,
    },
    {
      id: "seg_qa_to_customer",
      label: "Transit",
      type: "transit",
      mean: 10,
      median: 10,
      pct_of_total: 0,
    },
  ],
};

describe("computeOrderArrivalMarkers", () => {
  it("positions an order in its visible segment", () => {
    const result = computeOrderArrivalMarkers(
      [order],
      [batch],
      { direct: summary },
      false,
      new Set(["production"]),
    );

    expect(result.direct?.mean?.positionPct).toBe(50);
    expect(result.direct?.mean?.n).toBe(1);
    expect(result.direct?.mean?.daysBeforeRouteEndpoint).toBe(20);
    expect(result.direct?.mean?.totalOrderLines).toBe(1);
    expect(result.direct?.mean?.beforeTrace).toBe(false);
    expect(result.direct?.mean?.afterTrace).toBe(false);
  });

  it("uses the route endpoint rather than goods issue as its anchor", () => {
    const laterArrivalBatch = {
      ...batch,
      delivery_date: "2026-02-15",
    };
    const result = computeOrderArrivalMarkers([order], [laterArrivalBatch], {
      direct: summary,
    });

    expect(result.direct?.mean?.daysBeforeRouteEndpoint).toBe(30);
    expect(result.direct?.mean?.positionPct).toBeCloseTo((5 / 35) * 100);
  });

  it("uses the delivery-specific route and endpoint for shared batches", () => {
    const sharedBatch = {
      ...batch,
      route: "hub",
      delivery_date: "2026-03-01",
    };
    const directOrder = {
      ...order,
      route: "direct",
      route_endpoint_date: "2026-02-05",
    };

    const result = computeOrderArrivalMarkers([directOrder], [sharedBatch], {
      direct: summary,
      hub: { ...summary, label: "Hub" },
    });

    expect(result.direct?.mean?.daysBeforeRouteEndpoint).toBe(20);
    expect(result.hub).toBeUndefined();
  });

  it("keeps the population fixed when collapsing hidden segments", () => {
    const result = computeOrderArrivalMarkers(
      [order],
      [batch],
      { direct: summary },
      false,
      new Set(["transit"]),
    );

    expect(result.direct?.mean?.positionPct).toBe(0);
    expect(result.direct?.mean?.n).toBe(1);
    expect(result.direct?.mean?.daysBeforeRouteEndpoint).toBe(20);
    expect(result.direct?.mean?.beforeVisibleCount).toBe(1);
    expect(result.direct?.mean?.beforeTrace).toBe(true);
    expect(result.direct?.mean?.afterTrace).toBe(false);
  });

  it("counts a multi-batch order line once per route", () => {
    const secondBatch = {
      ...batch,
      batch: "B-2",
      qa_release_date: "2026-01-28",
    };
    const result = computeOrderArrivalMarkers(
      [{ ...order, batches: ["B-1", "B-2"] }],
      [batch, secondBatch],
      { direct: summary },
    );

    expect(result.direct?.mean?.n).toBe(1);
    expect(result.direct?.mean?.routeLabel).toBe("Direct");
  });

  it("excludes outliers from the mean without changing marker population", () => {
    const durations = [1, 1, 2, 2, 100];
    const rows = durations.map((duration, index) => ({
      ...order,
      sales_order: `${index + 1}`,
      order_created: daysBefore(batch.delivery_date ?? "", duration),
      batches: [`B-${index + 1}`],
    }));
    const batches = durations.map((_, index) => ({
      ...batch,
      batch: `B-${index + 1}`,
    }));

    const result = computeOrderArrivalMarkers(
      rows,
      batches,
      { direct: summary },
      true,
    );

    expect(result.direct?.mean).toMatchObject({
      daysBeforeRouteEndpoint: 1.5,
      n: 5,
      totalOrderLines: 5,
    });
    expect(result.direct?.median).toMatchObject({
      daysBeforeRouteEndpoint: 2,
      n: 5,
      totalOrderLines: 5,
    });
  });

  it("projects through hidden stages using the complete timeline coordinate", () => {
    const twoStageSummary: PipelineSummary = {
      label: "Direct",
      total_mean: 20,
      total_median: 20,
      stages: [
        {
          id: "seg_prodstart_to_prodfinish",
          label: "Production",
          type: "production",
          mean: 10,
          median: 10,
          pct_of_total: 50,
        },
        {
          id: "seg_qa_to_customer",
          label: "Transit",
          type: "transit",
          mean: 10,
          median: 10,
          pct_of_total: 50,
        },
      ],
    };
    const result = computeOrderArrivalMarkers(
      [
        {
          ...order,
          order_created: daysBefore(batch.delivery_date ?? "", 10),
        },
      ],
      [batch],
      { direct: twoStageSummary },
      false,
      new Set(["production"]),
    );

    expect(result.direct?.mean?.daysBeforeRouteEndpoint).toBe(10);
    expect(result.direct?.mean?.positionPct).toBe(100);
    expect(result.direct?.mean?.beforeTrace).toBe(false);
    expect(result.direct?.mean?.afterTrace).toBe(false);
  });

  it("marks aggregate orders after the visible pipeline end", () => {
    const shortTransit: PipelineSummary = {
      label: "Direct",
      total_mean: 3,
      total_median: 3,
      stages: [
        {
          id: "seg_qa_to_customer",
          label: "Transit",
          type: "transit",
          mean: 3,
          median: 3,
          pct_of_total: 100,
        },
      ],
    };
    const result = computeOrderArrivalMarkers(
      [{ ...order, order_created: "2026-02-06" }],
      [batch],
      { direct: shortTransit },
    );

    expect(result.direct?.mean?.positionPct).toBe(100);
    expect(result.direct?.mean?.afterTrace).toBe(true);
    expect(result.direct?.mean?.beforeTrace).toBe(false);
  });

  it("pins long-lead orders before a short traced pipeline", () => {
    const shortTransit: PipelineSummary = {
      label: "Direct",
      total_mean: 3,
      total_median: 3,
      stages: [
        {
          id: "seg_qa_to_customer",
          label: "Transit",
          type: "transit",
          mean: 3,
          median: 3,
          pct_of_total: 100,
        },
      ],
    };
    const result = computeOrderArrivalMarkers(
      [
        {
          ...order,
          order_created: daysBefore(batch.delivery_date ?? "", 63),
        },
      ],
      [batch],
      { direct: shortTransit },
    );

    expect(result.direct?.median?.daysBeforeRouteEndpoint).toBe(63);
    expect(result.direct?.median?.beforeTrace).toBe(true);
    expect(result.direct?.median?.afterTrace).toBe(false);
    expect(result.direct?.median?.positionPct).toBe(0);
  });

  it("ignores stages with missing duration values", () => {
    const summaryWithMissing: PipelineSummary = {
      label: "Direct",
      total_mean: 3,
      total_median: 3,
      stages: [
        {
          id: "seg_proc_to_prodstart",
          label: "Procurement",
          type: "procurement",
          mean: 0,
          median: undefined as unknown as number,
          pct_of_total: 0,
        },
        {
          id: "seg_qa_to_customer",
          label: "Transit",
          type: "transit",
          mean: 3,
          median: 3,
          pct_of_total: 100,
        },
      ],
    };
    const result = computeOrderArrivalMarkers(
      [
        {
          ...order,
          order_created: daysBefore(batch.delivery_date ?? "", 63),
        },
      ],
      [batch],
      { direct: summaryWithMissing },
    );

    expect(result.direct?.median?.beforeTrace).toBe(true);
    expect(result.direct?.median?.afterTrace).toBe(false);
  });
});
