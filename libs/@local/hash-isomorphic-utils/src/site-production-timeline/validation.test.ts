// oxlint-disable max-lines -- the file is one large neutral timeline fixture plus the cases that each perturb it
import { describe, expect, test } from "vitest";

import { parseSiteProductionTimeline } from "../site-production-timeline.js";

type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;

interface JsonObject {
  [key: string]: JsonValue;
}

const isJsonObject = (value: JsonValue | undefined): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getSection = (value: JsonObject, key: string): JsonObject => {
  const section = value[key];

  if (!isJsonObject(section)) {
    throw new TypeError(`Fixture section ${key} is not an object`);
  }

  return section;
};

const patchSection = (
  value: JsonObject,
  key: string,
  patch: JsonObject,
): void => {
  value[key] = { ...getSection(value, key), ...patch };
};

const patchBatch = (
  value: JsonObject,
  index: number,
  patch: JsonObject,
): void => {
  const { batches } = value;

  if (!Array.isArray(batches)) {
    throw new TypeError("Fixture batches is not an array");
  }

  const batch = batches[index];

  if (!isJsonObject(batch)) {
    throw new TypeError(`Fixture batch ${index} is not an object`);
  }

  batches[index] = { ...batch, ...patch };
};

const fixture = (): JsonObject => ({
  schema_version: "1.3",
  artifact_type: "site_production_timeline",
  artifact_version: "1.2",
  site_id: "harbor-roastery",
  plant: "HARBOR",
  generated_at: "2026-07-20T00:00:00Z",
  date_bounds: { start: "2026-07-01", end: "2026-07-04" },
  buildings: [{ id: "roast-house", name: "Roast House" }],
  lines: [
    {
      id: "roaster-a",
      name: "Roaster A",
      building_id: "roast-house",
      aliases: ["RA"],
      kind: "internal_line",
      resource_ids: ["drum-a"],
    },
  ],
  resources: [
    {
      id: "drum-a",
      name: "Roasting Drum A",
      line_id: "roaster-a",
      building_id: "roast-house",
      cost_center: null,
      equipment_name: "Drum A",
      operation_category: "roasting",
      source: { file: "neutral-seed" },
    },
  ],
  product_families: [
    {
      bg_code: null,
      bg_name: null,
      group_code: "ROAST",
      family_key: "dark-roast",
      materials: ["90000300001"],
      default_line_ids: ["roaster-a"],
      source: { file: "neutral-seed" },
    },
  ],
  products: [
    {
      id: "harbor-dark-roast",
      name: "Harbor Dark Roast",
      material: "90000300001",
    },
  ],
  batches: [
    {
      id: "batch-1",
      material: "90000300001",
      material_name: "Harbor Dark Roast",
      batch: "R-001",
      order: "ROAST-001",
      start: "2026-07-01",
      end: "2026-07-03",
      span_days: 3,
      quantity: 100,
      uom: "KG",
      timing_kind: "production_window",
      start_source: "charge_day",
      finish_source: "fill_day",
      derivation: "confirmed production window",
      building_id: "roast-house",
      line_id: "roaster-a",
      line_raw: "RA",
      line_source: "campaign_sheet",
      line_confidence: "exact",
      candidate_line_ids: [],
      line_reason: "confirmed line",
      resource_ids: ["drum-a"],
      campaign_core: null,
      campaign_id: null,
      product_family_key: "dark-roast",
      allocated_quantity: 0,
      unallocated_quantity: 100,
      allocation_overage_quantity: 0,
      allocation_tolerance: 0.000001,
      data_quality_flags: [],
    },
    {
      id: "receipt-1",
      material: "90000300002",
      material_name: "Summit Medium Roast",
      batch: "R-002",
      order: "ROAST-002",
      start: "2026-07-04",
      end: "2026-07-04",
      span_days: 1,
      quantity: 50,
      uom: "KG",
      timing_kind: "receipt_event",
      start_source: "receipt_date",
      finish_source: "receipt_date",
      derivation: "receipt-only evidence",
      building_id: null,
      line_id: null,
      line_raw: null,
      line_source: "unresolved",
      line_confidence: "unresolved",
      candidate_line_ids: [],
      line_reason: "line unavailable",
      resource_ids: [],
      campaign_core: null,
      campaign_id: null,
      product_family_key: null,
      allocated_quantity: 0,
      unallocated_quantity: 50,
      allocation_overage_quantity: 0,
      allocation_tolerance: 0.000001,
      data_quality_flags: ["line_unresolved", "family_unresolved"],
    },
  ],
  consumption_edges: [],
  data_quality: {
    batch_count: 2,
    edge_count: 0,
    timing_kind_counts: { production_window: 1, receipt_event: 1 },
    line_confidence_counts: { exact: 1, unresolved: 1 },
    edge_confidence_counts: {},
    batches_with_allocation_overage: 0,
    batches_missing_family: 1,
    negative_waiting_intervals: 0,
    materials_with_multiple_lines: [],
    products_missing_family: [],
    unidentifiable_receipt_events: 0,
  },
  source: {
    production_windows: "neutral seed windows",
    receipt_events: "neutral seed receipts",
    consumption_edges: "neutral seed consumption",
    metadata: { catalog: "neutral seed" },
    unidentifiable_receipt_events: 0,
  },
});

const fixtureWithAllocation = (allocatedQuantity: number): JsonObject => {
  const value = fixture();
  const expectedOverage = Math.max(0, allocatedQuantity - 100);
  patchBatch(value, 0, {
    allocated_quantity: allocatedQuantity,
    unallocated_quantity: Math.max(0, 100 - allocatedQuantity),
    allocation_overage_quantity: expectedOverage,
  });
  value.consumption_edges = [
    {
      id: "edge-1",
      source_batch_id: "batch-1",
      target_batch_id: "receipt-1",
      candidate_target_batch_ids: [],
      unresolved_outputs: [],
      consuming_order: "ROAST-002",
      consumption_date: "2026-07-04",
      quantity: allocatedQuantity,
      uom: "KG",
      confidence: "exact",
      reason: "synthetic allocation",
      waiting_days: 1,
      evidence_ids: ["movement-1"],
    },
  ];
  patchSection(value, "data_quality", {
    edge_count: 1,
    edge_confidence_counts: { exact: 1 },
    batches_with_allocation_overage: expectedOverage > 0 ? 1 : 0,
  });
  return value;
};

const emptyFixture = (): JsonObject => {
  const value = fixture();
  patchSection(value, "data_quality", {
    batch_count: 0,
    timing_kind_counts: {},
    line_confidence_counts: {},
    batches_missing_family: 0,
  });
  return {
    ...value,
    date_bounds: { start: null, end: null },
    batches: [],
  };
};

describe("site production timeline validation", () => {
  test("parses a small neutral timeline", () => {
    expect.hasAssertions();

    const parsed = parseSiteProductionTimeline(fixture(), "harbor-roastery");
    expect(parsed.schema_version).toBe("1.3");
    expect(parsed.artifact_version).toBe("1.2");
    expect(parsed.batches).toHaveLength(2);
  });

  test.each([
    {
      label: "shared schema",
      key: "schema_version",
      value: "2.0",
      error: /shared schema version 2\.0/u,
    },
    {
      label: "artifact",
      key: "artifact_version",
      value: "2.0",
      error: /site timeline artifact version 2\.0/u,
    },
  ])(
    "rejects an unsupported $label version actionably",
    ({ key, value, error }) => {
      expect.hasAssertions();

      expect(() =>
        parseSiteProductionTimeline({ ...fixture(), [key]: value }),
      ).toThrow(error);
    },
  );

  test("rejects an unsupported producer line source", () => {
    expect.hasAssertions();

    const value = fixture();
    patchBatch(value, 0, { line_source: "sap_operation" });
    expect(() => parseSiteProductionTimeline(value)).toThrow(/line_source/u);
  });

  test.each(["sap_order_operation", "sap_recipe_operation"])(
    "accepts producer provenance %s",
    (lineSource) => {
      expect.hasAssertions();

      const value = fixture();
      patchBatch(value, 0, { line_source: lineSource });
      expect(parseSiteProductionTimeline(value).batches[0]?.line_source).toBe(
        lineSource,
      );
    },
  );

  test("accepts current receipt diagnostics with strict types", () => {
    expect.hasAssertions();

    const value = fixture();
    patchSection(value, "data_quality", { unidentifiable_receipt_events: 2 });
    patchSection(value, "source", {
      unidentifiable_receipt_events: 2,
      receipt_warnings: ["Skipped receipt without batch or order"],
    });
    const parsed = parseSiteProductionTimeline(value);
    expect(parsed.data_quality.unidentifiable_receipt_events).toBe(2);
    expect(parsed.source.receipt_warnings).toStrictEqual([
      "Skipped receipt without batch or order",
    ]);
  });

  test.each([
    {
      label: "unidentifiable receipt count",
      key: "unidentifiable_receipt_events",
      invalid: -1,
    },
    { label: "receipt warning", key: "receipt_warnings", invalid: [""] },
  ])("rejects an invalid $label", ({ key, invalid }) => {
    expect.hasAssertions();

    const value = fixture();
    patchSection(value, "source", { [key]: invalid });
    expect(() => parseSiteProductionTimeline(value)).toThrow(
      new RegExp(key, "u"),
    );
  });

  test("requires matching raw and quality unidentifiable receipt counts", () => {
    expect.hasAssertions();

    const missing = fixture();
    const { unidentifiable_receipt_events: _omitted, ...source } = getSection(
      missing,
      "source",
    );
    missing.source = source;
    expect(() => parseSiteProductionTimeline(missing)).toThrow(
      /unidentifiable_receipt_events/u,
    );

    const mismatch = fixture();
    patchSection(mismatch, "source", { unidentifiable_receipt_events: 1 });
    expect(() => parseSiteProductionTimeline(mismatch)).toThrow(
      /data quality totals/u,
    );
  });

  test("accepts an empty artifact with both date bounds null", () => {
    expect.hasAssertions();

    const parsed = parseSiteProductionTimeline(emptyFixture());
    expect(parsed.date_bounds).toStrictEqual({ start: null, end: null });
    expect(parsed.batches).toStrictEqual([]);
  });

  test.each([
    [{ start: null, end: "2026-05-12" }],
    [{ start: "2026-05-01", end: null }],
  ])("rejects partial-null date bounds", (dateBounds) => {
    expect.hasAssertions();

    expect(() =>
      parseSiteProductionTimeline({
        ...emptyFixture(),
        date_bounds: dateBounds,
      }),
    ).toThrow(/both be null or both be ISO dates/u);
  });

  test("rejects reversed non-null date bounds", () => {
    expect.hasAssertions();

    expect(() =>
      parseSiteProductionTimeline({
        ...emptyFixture(),
        date_bounds: { start: "2026-05-12", end: "2026-05-01" },
      }),
    ).toThrow(/start must not be after end/u);
  });

  test.each([
    [{ start: "2026-06-30", end: "2026-07-04" }, "earlier start"],
    [{ start: "2026-07-01", end: "2026-07-05" }, "later end"],
  ])("rejects non-exact nonempty bounds with %s", (dateBounds) => {
    expect.hasAssertions();

    expect(() =>
      parseSiteProductionTimeline({
        ...fixture(),
        date_bounds: dateBounds,
      }),
    ).toThrow(/minimum batch start and maximum batch end/u);
  });

  test("rejects receipt events which claim a duration", () => {
    expect.hasAssertions();

    const value = fixture();
    patchBatch(value, 1, { end: "2026-07-05", span_days: 2 });
    value.date_bounds = { start: "2026-07-01", end: "2026-07-05" };
    expect(() => parseSiteProductionTimeline(value)).toThrow(
      /one-day point event/u,
    );
  });

  test("rejects a resolved confidence without a line id", () => {
    expect.hasAssertions();

    const value = fixture();
    patchBatch(value, 0, { line_id: null });
    expect(() => parseSiteProductionTimeline(value)).toThrow(
      /requires one line_id/u,
    );
  });

  test("rejects an exact edge without exactly one target", () => {
    expect.hasAssertions();

    const value = fixture();
    value.consumption_edges = [
      {
        id: "edge-1",
        source_batch_id: "batch-1",
        target_batch_id: null,
        candidate_target_batch_ids: [],
        unresolved_outputs: [],
        consuming_order: "ROAST-002",
        consumption_date: "2026-07-04",
        quantity: 1,
        uom: "KG",
        confidence: "exact",
        reason: "invalid exact edge",
        waiting_days: 1,
        evidence_ids: ["movement-1"],
      },
    ];
    patchSection(value, "data_quality", {
      edge_count: 1,
      edge_confidence_counts: { exact: 1 },
    });
    expect(() => parseSiteProductionTimeline(value)).toThrow(
      /exact edge requires one target/u,
    );
  });

  test("rejects stale quality totals and non-null empty bounds", () => {
    expect.hasAssertions();

    const value = emptyFixture();
    value.date_bounds = { start: "2026-07-01", end: "2026-07-01" };
    expect(() => parseSiteProductionTimeline(value)).toThrow(
      /empty artifacts must have null date bounds/u,
    );

    const stale = fixture();
    patchSection(stale, "data_quality", { batch_count: 99 });
    expect(() => parseSiteProductionTimeline(stale)).toThrow(
      /data quality totals/u,
    );
  });

  test("rejects null overage for a known quantity with over-allocation", () => {
    expect.hasAssertions();

    const value = fixtureWithAllocation(125);
    patchBatch(value, 0, { allocation_overage_quantity: null });
    expect(() => parseSiteProductionTimeline(value)).toThrow(
      /allocation totals must reconcile/u,
    );
  });

  test("rejects null overage for a known quantity without over-allocation", () => {
    expect.hasAssertions();

    const value = fixture();
    patchBatch(value, 0, { allocation_overage_quantity: null });
    expect(() => parseSiteProductionTimeline(value)).toThrow(
      /allocation totals must reconcile/u,
    );
  });

  test("allows null overage when quantity is unknown", () => {
    expect.hasAssertions();

    const value = fixture();
    patchBatch(value, 0, {
      quantity: null,
      unallocated_quantity: null,
      allocation_overage_quantity: null,
    });
    expect(
      parseSiteProductionTimeline(value).batches[0]
        ?.allocation_overage_quantity,
    ).toBeNull();
  });

  test("rejects a mismatched positive overage", () => {
    expect.hasAssertions();

    const value = fixtureWithAllocation(125);
    patchBatch(value, 0, { allocation_overage_quantity: 24 });
    expect(() => parseSiteProductionTimeline(value)).toThrow(
      /allocation totals must reconcile/u,
    );
  });

  test("counts every reportable reconciled overage without value hiding", () => {
    expect.hasAssertions();

    const value = fixtureWithAllocation(125);
    expect(
      parseSiteProductionTimeline(value).data_quality
        .batches_with_allocation_overage,
    ).toBe(1);
    patchSection(value, "data_quality", { batches_with_allocation_overage: 0 });
    expect(() => parseSiteProductionTimeline(value)).toThrow(
      /data quality totals/u,
    );
  });
});
