import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  planSupplyChainDatasetImport,
  uploadSupplyChainDataset,
} from "./supply-chain-dataset-import";

import type { WebId } from "@blockprotocol/type-system";
import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";

const writeJson = (filePath: string, value: unknown) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

describe("supply-chain dataset import", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  const makeDataset = (scheduleVersion = "1.1") => {
    const sourceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "supply-chain-import-"),
    );
    tempDirs.push(sourceDir);

    writeJson(path.join(sourceDir, "products.json"), [
      { id: "demo-product", name: "Demo Product", material: "1000" },
    ]);
    writeJson(path.join(sourceDir, "sites.json"), [
      { slug: "demo-site", name: "Demo Site" },
    ]);
    writeJson(path.join(sourceDir, "demo-product", "graph.json"), {
      product_id: "demo-product",
      nodes: [],
      edges: [],
      pipeline_summary: {},
    });
    writeJson(
      path.join(sourceDir, "demo-product", "steps", "prod_to_qa.json"),
      { id: "prod_to_qa" },
    );
    writeJson(
      path.join(sourceDir, "demo-product", "production_schedule.json"),
      {
        schema_version: "1.1",
        artifact_type: "production_schedule",
        artifact_version: scheduleVersion,
        product_id: "demo-product",
        product_name: "Demo Product",
        product_material: "1000",
        plant: "DEMO",
        quantity_tolerance: 0.000001,
        ...(scheduleVersion === "1.2"
          ? {
              material_names: {
                "1000": "Demo Product",
                "2000": "Consumed Output",
              },
            }
          : {}),
        source: {
          production_windows: "test",
          cadence: "test",
          ...(scheduleVersion === "1.2"
            ? { consumption_events: "test" }
            : { allocations: "test" }),
          order_outputs: "test",
          dispatches: "test",
        },
        lanes: [
          {
            material: "1000",
            name: "Demo Product",
            bom_depth: 0,
            role: "finished_good",
            uom: "KG",
            campaigns: [],
            batches:
              scheduleVersion === "1.2"
                ? [
                    {
                      id: "1000::B1",
                      material: "1000",
                      batch: "B1",
                      order: "MAKE-B1",
                      start: "2026-01-01",
                      end: "2026-01-01",
                      span_days: 1,
                      lifecycle_start: "2026-01-01",
                      lifecycle_end: "2026-01-03",
                      lifecycle_end_reason: "depleted",
                      lifecycle_balance_status: "balanced",
                      lifecycle_overage_quantity: 0,
                      remaining_quantity: 0,
                      last_exit_date: "2026-01-03",
                      lifecycle_exit_quantity: 10,
                      quantity: 10,
                      uom: "KG",
                      campaign_core: null,
                      campaign_id: null,
                      building: null,
                      start_source: "receipt_date",
                      finish_source: "receipt_date",
                      derivation: "receipt_event",
                      timing_kind: "receipt_event",
                      consumption_event_ids: ["event-1"],
                      allocation_status: "selected",
                      allocation_totals: {
                        selected: 10,
                        shared: 0,
                        other: 0,
                        open: 0,
                        unresolved: 0,
                      },
                      allocated_quantity: 10,
                      unallocated_quantity: 0,
                      allocation_tolerance: 0.000001,
                      allocation_overage_quantity: 0,
                      allocation_tolerance_reason:
                        "consumption exceeds output quantity",
                    },
                  ]
                : [],
          },
          {
            material: "2000",
            name: "Consumed Output",
            bom_depth: 1,
            role: "intermediate",
            uom: "KG",
            campaigns: [],
            batches:
              scheduleVersion === "1.2"
                ? [
                    {
                      id: "2000::C1",
                      material: "2000",
                      batch: "C1",
                      order: "USE-B1",
                      start: "2026-01-03",
                      end: "2026-01-03",
                      span_days: 1,
                      lifecycle_start: "2026-01-03",
                      lifecycle_end: "2026-01-05",
                      lifecycle_end_reason: "open",
                      lifecycle_balance_status: "balanced",
                      lifecycle_overage_quantity: 0,
                      remaining_quantity: 5,
                      last_exit_date: null,
                      lifecycle_exit_quantity: 0,
                      quantity: 5,
                      uom: "KG",
                      campaign_core: null,
                      campaign_id: null,
                      building: null,
                      start_source: "receipt_date",
                      finish_source: "receipt_date",
                      derivation: "receipt_event",
                      timing_kind: "receipt_event",
                      consumption_event_ids: [],
                      allocation_status: "open",
                      allocation_totals: {
                        selected: 0,
                        shared: 0,
                        other: 0,
                        open: 5,
                        unresolved: 0,
                      },
                      allocated_quantity: 0,
                      unallocated_quantity: 5,
                      allocation_tolerance: 0.000001,
                      allocation_overage_quantity: 0,
                      allocation_tolerance_reason: "numeric rounding",
                    },
                  ]
                : [],
          },
        ],
        ...(scheduleVersion === "1.2"
          ? {
              consumption_events: [
                {
                  id: "event-1",
                  source_batch_id: "1000::B1",
                  consuming_order: "USE-B1",
                  consumption_date: "2026-01-03",
                  episode_scope: "in_episode",
                  net_quantity: 10,
                  status: "selected",
                  confidence: "exact",
                  reason: "direct output",
                  direct_consumer_materials: ["2000"],
                },
              ],
              batch_links: [
                {
                  id: "link-1",
                  event_id: "event-1",
                  target_batch_ids: ["2000::C1"],
                },
              ],
              dispatch_events: [
                {
                  id: "dispatch-1",
                  batch_id: "2000::C1",
                  material: "2000",
                  batch: "C1",
                  dispatch_date: "2026-01-04",
                  quantity: 1,
                  uom: "KG",
                  bwart: "601",
                  episode_scope: "in_episode",
                  delivery_coverage: "exact",
                  deliveries: [
                    {
                      delivery_number: "D1",
                      delivery_item: "10",
                      quantity: 1,
                      uom: "KG",
                    },
                  ],
                },
              ],
            }
          : { consumption_evidence: [] }),
      },
    );
    writeJson(path.join(sourceDir, "_global", "supplier_performance.json"), {
      vendors: [],
    });
    writeJson(path.join(sourceDir, "current.json"), {
      datasetVersion: "ignored",
    });

    return sourceDir;
  };

  it("generates a manifest from the static dataset shape", () => {
    const plan = planSupplyChainDatasetImport({
      sourceDir: makeDataset(),
      version: "local-test",
    });

    expect(plan.manifest).toEqual({
      datasetVersion: "local-test",
      products: ["demo-product"],
      productionSchedules: ["demo-product"],
      sites: ["demo-site"],
      steps: { "demo-product": ["prod_to_qa"] },
    });
    expect(plan.files.map(({ relKey }) => relKey)).toEqual([
      "_global/supplier_performance.json",
      "demo-product/graph.json",
      "demo-product/production_schedule.json",
      "demo-product/steps/prod_to_qa.json",
      "products.json",
      "sites.json",
    ]);
  });

  it("does not advertise a malformed production schedule", () => {
    const sourceDir = makeDataset();
    writeJson(
      path.join(sourceDir, "demo-product", "production_schedule.json"),
      { artifact_type: "production_schedule", product_id: "wrong-product" },
    );
    expect(() =>
      planSupplyChainDatasetImport({
        sourceDir,
        version: "local-test",
      }),
    ).toThrow("invalid production_schedule.json");
  });

  it("rejects unknown production schedule versions", () => {
    expect(() =>
      planSupplyChainDatasetImport({
        sourceDir: makeDataset("2.0"),
        version: "local-test",
      }),
    ).toThrow("invalid production_schedule.json");
  });

  it("accepts a complete version 1.2 production schedule", () => {
    const validPlan = planSupplyChainDatasetImport({
      sourceDir: makeDataset("1.2"),
      version: "local-test",
    });
    expect(validPlan.manifest.productionSchedules).toEqual(["demo-product"]);
  });

  it("rejects malformed legacy dispatch evidence", () => {
    const sourceDir = makeDataset("1.1");
    const schedulePath = path.join(
      sourceDir,
      "demo-product",
      "production_schedule.json",
    );
    const schedule = JSON.parse(
      fs.readFileSync(schedulePath, "utf8"),
    ) as Record<string, unknown>;
    schedule.dispatch_events = [{}];
    writeJson(schedulePath, schedule);

    expect(() =>
      planSupplyChainDatasetImport({
        sourceDir,
        version: "local-test",
      }),
    ).toThrow("invalid production_schedule.json");
  });

  /* eslint-disable @typescript-eslint/no-explicit-any, no-param-reassign --
   * These tests deliberately mutate one field in a parsed wire payload.
   */
  const mutateV12Schedule = (
    mutate: (schedule: Record<string, any>) => void,
  ): string => {
    const sourceDir = makeDataset("1.2");
    const schedulePath = path.join(
      sourceDir,
      "demo-product",
      "production_schedule.json",
    );
    const schedule = JSON.parse(
      fs.readFileSync(schedulePath, "utf8"),
    ) as Record<string, any>;
    mutate(schedule);
    writeJson(schedulePath, schedule);
    return sourceDir;
  };

  it.each([
    [
      "an over-depleted lifecycle",
      (schedule: any) => {
        const batch = schedule.lanes[0].batches[0];
        batch.lifecycle_balance_status = "over_depleted";
        batch.lifecycle_exit_quantity = 12;
        batch.lifecycle_overage_quantity = 2;
      },
    ],
    [
      "an unknown opening balance",
      (schedule: any) => {
        const batch = schedule.lanes[1].batches[0];
        batch.quantity = null;
        batch.remaining_quantity = null;
        batch.lifecycle_balance_status = "unknown_opening_balance";
        batch.start = batch.lifecycle_start;
        batch.end = batch.lifecycle_end;
        batch.span_days = 3;
        batch.last_exit_date = batch.lifecycle_end;
        batch.lifecycle_end_reason = "last_evidence";
        batch.start_source = "first_recorded_exit";
        batch.finish_source = "last_recorded_exit";
        batch.derivation = "opening_balance_inference";
        batch.timing_kind = "lifecycle_only";
        schedule.dispatch_events[0].episode_scope = "pre_receipt";
      },
    ],
    [
      "a pre-receipt consumption event",
      (schedule: any) => {
        const batch = schedule.lanes[0].batches[0];
        batch.quantity = null;
        batch.remaining_quantity = null;
        batch.lifecycle_balance_status = "unknown_opening_balance";
        batch.start = batch.lifecycle_start;
        batch.end = batch.lifecycle_end;
        batch.span_days = 3;
        batch.last_exit_date = batch.lifecycle_end;
        batch.lifecycle_end_reason = "last_evidence";
        batch.start_source = "first_recorded_exit";
        batch.finish_source = "last_recorded_exit";
        batch.derivation = "opening_balance_inference";
        batch.timing_kind = "lifecycle_only";
        schedule.consumption_events[0].episode_scope = "pre_receipt";
      },
    ],
    [
      "a post-depletion consumption event",
      (schedule: any) => {
        const batch = schedule.lanes[0].batches[0];
        batch.lifecycle_balance_status = "over_depleted";
        batch.lifecycle_exit_quantity = 20;
        batch.lifecycle_overage_quantity = 10;
        batch.last_exit_date = "2026-01-04";
        schedule.consumption_events[0].episode_scope = "post_depletion";
        schedule.consumption_events[0].consumption_date = "2026-01-04";
      },
    ],
    [
      "a post-depletion dispatch event",
      (schedule: any) => {
        const batch = schedule.lanes[1].batches[0];
        batch.lifecycle_end = "2026-01-03";
        batch.lifecycle_end_reason = "depleted";
        batch.lifecycle_balance_status = "over_depleted";
        batch.remaining_quantity = 0;
        batch.last_exit_date = "2026-01-04";
        batch.lifecycle_exit_quantity = 6;
        batch.lifecycle_overage_quantity = 1;
        schedule.dispatch_events[0].episode_scope = "post_depletion";
      },
    ],
    [
      "an unresolved event without a consuming order or link",
      (schedule: any) => {
        const event = schedule.consumption_events[0];
        const batch = schedule.lanes[0].batches[0];
        event.consuming_order = null;
        event.status = "unresolved";
        batch.allocation_totals.selected = 0;
        batch.allocation_totals.unresolved = 10;
        schedule.batch_links = [];
      },
    ],
    [
      "a partial delivery coverage",
      (schedule: any) => {
        schedule.dispatch_events[0].deliveries[0].quantity = 0.5;
        schedule.dispatch_events[0].delivery_coverage = "partial";
      },
    ],
    [
      "delivery data with incomparable UOM",
      (schedule: any) => {
        delete schedule.dispatch_events[0].deliveries[0].uom;
        schedule.dispatch_events[0].delivery_coverage = "uom_incomparable";
      },
    ],
    [
      "a dispatch without deliveries",
      (schedule: any) => {
        schedule.dispatch_events[0].deliveries = [];
        schedule.dispatch_events[0].delivery_coverage = "none";
      },
    ],
    [
      "a legacy artifact without material names",
      (schedule: any) => {
        delete schedule.material_names;
      },
    ],
  ])("accepts v1.2 with %s", (_label, mutate) => {
    const validPlan = planSupplyChainDatasetImport({
      sourceDir: mutateV12Schedule(mutate),
      version: "local-test",
    });
    expect(validPlan.manifest.productionSchedules).toEqual(["demo-product"]);
  });

  it.each([
    [
      "missing referenced material name",
      (schedule: any) => {
        delete schedule.material_names["2000"];
      },
    ],
    [
      "duplicate batch id",
      (schedule: any) => {
        schedule.lanes[1].batches[0].id = "1000::B1";
      },
    ],
    [
      "invalid calendar date",
      (schedule: any) => {
        schedule.consumption_events[0].consumption_date = "2026-02-30";
      },
    ],
    [
      "invalid lane role",
      (schedule: any) => {
        schedule.lanes[0].role = "supplier";
      },
    ],
    [
      "non-positive batch quantity",
      (schedule: any) => {
        schedule.lanes[0].batches[0].quantity = 0;
      },
    ],
    [
      "last exit outside lifecycle",
      (schedule: any) => {
        schedule.lanes[0].batches[0].last_exit_date = "2026-01-04";
      },
    ],
    [
      "non-positive event quantity",
      (schedule: any) => {
        schedule.consumption_events[0].net_quantity = 0;
      },
    ],
    [
      "event outside lifecycle",
      (schedule: any) => {
        schedule.consumption_events[0].consumption_date = "2026-01-04";
      },
    ],
    [
      "unreferenced event",
      (schedule: any) => {
        schedule.lanes[0].batches[0].consumption_event_ids = [];
      },
    ],
    [
      "aggregate quantity mismatch",
      (schedule: any) => {
        schedule.lanes[0].batches[0].allocated_quantity = 9;
      },
    ],
    [
      "status total mismatch",
      (schedule: any) => {
        schedule.lanes[0].batches[0].allocation_totals.selected = 9;
      },
    ],
    [
      "open lifecycle without residual",
      (schedule: any) => {
        schedule.lanes[1].batches[0].remaining_quantity = 0;
      },
    ],
    [
      "depleted lifecycle with residual",
      (schedule: any) => {
        schedule.lanes[0].batches[0].remaining_quantity = 1;
      },
    ],
    [
      "lifecycle balance mismatch",
      (schedule: any) => {
        schedule.lanes[0].batches[0].lifecycle_exit_quantity = 9;
      },
    ],
    [
      "unknown lifecycle balance status",
      (schedule: any) => {
        schedule.lanes[0].batches[0].lifecycle_balance_status = "estimated";
      },
    ],
    [
      "null remaining quantity for a balanced lifecycle",
      (schedule: any) => {
        schedule.lanes[0].batches[0].remaining_quantity = null;
      },
    ],
    [
      "known quantity for an unknown opening balance",
      (schedule: any) => {
        const batch = schedule.lanes[1].batches[0];
        batch.remaining_quantity = null;
        batch.lifecycle_balance_status = "unknown_opening_balance";
      },
    ],
    [
      "incorrect lifecycle overage",
      (schedule: any) => {
        const batch = schedule.lanes[0].batches[0];
        batch.lifecycle_balance_status = "over_depleted";
        batch.lifecycle_exit_quantity = 12;
        batch.lifecycle_overage_quantity = 1;
      },
    ],
    [
      "invalid event confidence",
      (schedule: any) => {
        schedule.consumption_events[0].confidence = "likely";
      },
    ],
    [
      "unknown link event",
      (schedule: any) => {
        schedule.batch_links[0].event_id = "missing";
      },
    ],
    [
      "blank consuming order",
      (schedule: any) => {
        schedule.consumption_events[0].consuming_order = "";
      },
    ],
    [
      "linked event without a consuming order",
      (schedule: any) => {
        schedule.consumption_events[0].consuming_order = null;
        schedule.consumption_events[0].status = "unresolved";
        schedule.lanes[0].batches[0].allocation_totals.selected = 0;
        schedule.lanes[0].batches[0].allocation_totals.unresolved = 10;
      },
    ],
    [
      "pre-receipt scope without an unknown opening balance",
      (schedule: any) => {
        schedule.consumption_events[0].episode_scope = "pre_receipt";
      },
    ],
    [
      "post-depletion scope on an open lifecycle",
      (schedule: any) => {
        const event = schedule.consumption_events[0];
        event.source_batch_id = "2000::C1";
        event.episode_scope = "post_depletion";
        event.consumption_date = "2026-01-06";
        schedule.lanes[0].batches[0].consumption_event_ids = [];
        schedule.lanes[1].batches[0].consumption_event_ids = ["event-1"];
      },
    ],
    [
      "unknown target batch",
      (schedule: any) => {
        schedule.batch_links[0].target_batch_ids = ["missing"];
      },
    ],
    [
      "self-referential target",
      (schedule: any) => {
        schedule.batch_links[0].target_batch_ids = ["1000::B1"];
      },
    ],
    [
      "target material mismatch",
      (schedule: any) => {
        schedule.consumption_events[0].direct_consumer_materials = ["3000"];
      },
    ],
    [
      "dispatch endpoint mismatch",
      (schedule: any) => {
        schedule.dispatch_events[0].material = "wrong";
      },
    ],
    [
      "dispatch outside lifecycle",
      (schedule: any) => {
        schedule.dispatch_events[0].dispatch_date = "2026-01-06";
      },
    ],
    [
      "non-positive dispatch quantity",
      (schedule: any) => {
        schedule.dispatch_events[0].quantity = Number.POSITIVE_INFINITY;
      },
    ],
    [
      "invalid movement type",
      (schedule: any) => {
        schedule.dispatch_events[0].bwart = "602";
      },
    ],
    [
      "legacy route field",
      (schedule: any) => {
        schedule.dispatch_events[0].route = "direct";
      },
    ],
    [
      "invalid delivery quantity",
      (schedule: any) => {
        schedule.dispatch_events[0].deliveries[0].quantity = 0;
      },
    ],
    [
      "delivery coverage mismatch",
      (schedule: any) => {
        schedule.dispatch_events[0].delivery_coverage = "partial";
      },
    ],
    [
      "comparable coverage with a mismatched UOM",
      (schedule: any) => {
        schedule.dispatch_events[0].deliveries[0].uom = "T";
      },
    ],
    [
      "missing delivery item",
      (schedule: any) => {
        delete schedule.dispatch_events[0].deliveries[0].delivery_item;
      },
    ],
    [
      "invalid delivery date",
      (schedule: any) => {
        schedule.dispatch_events[0].deliveries[0].arrival_date = "2026-13-01";
      },
    ],
    [
      "duplicate delivery item",
      (schedule: any) => {
        schedule.dispatch_events[0].deliveries.push({
          ...schedule.dispatch_events[0].deliveries[0],
        });
      },
    ],
    [
      "span_days inconsistent with start and end",
      (schedule: any) => {
        schedule.lanes[0].batches[0].span_days = 2;
      },
    ],
    [
      "legacy top-level evidence",
      (schedule: any) => {
        schedule.consumption_evidence = [];
      },
    ],
    [
      "legacy batch allocations",
      (schedule: any) => {
        schedule.lanes[0].batches[0].allocations = [];
      },
    ],
  ])("rejects v1.2 %s", (_label, mutate) => {
    const sourceDir = mutateV12Schedule(mutate);
    expect(() =>
      planSupplyChainDatasetImport({
        sourceDir,
        version: "local-test",
      }),
    ).toThrow("invalid production_schedule.json");
  });
  /* eslint-enable @typescript-eslint/no-explicit-any, no-param-reassign */

  it("uploads source artifacts under the version and flips current last", async () => {
    const uploads: Array<{ key: string; body: string | Buffer }> = [];
    const uploadProvider = {
      uploadDirect: async ({
        key,
        body,
      }: {
        key: string;
        body: string | Buffer;
      }) => {
        uploads.push({ key, body });
      },
    } as unknown as FileStorageProvider;
    const webId = "00000000-0000-4000-8000-000000000001" as WebId;
    const plan = planSupplyChainDatasetImport({
      sourceDir: makeDataset(),
      version: "local-test",
    });

    const result = await uploadSupplyChainDataset({
      plan,
      uploadProvider,
      webId,
    });

    expect(result).toEqual({
      uploadedFiles: 8,
      products: 1,
      sites: 1,
      steps: 1,
    });
    expect(uploads.at(-2)?.key).toBe(
      `analysis/${webId}/supply-chain/local-test/manifest.json`,
    );
    expect(uploads.at(-1)?.key).toBe(
      `analysis/${webId}/supply-chain/current.json`,
    );
    expect(JSON.parse(String(uploads.at(-1)?.body))).toEqual({
      datasetVersion: "local-test",
    });
  });

  it("uploads an empty sites registry when the source omits sites.json", async () => {
    const sourceDir = makeDataset();
    fs.rmSync(path.join(sourceDir, "sites.json"));
    const uploads: Array<{ key: string; body: string | Buffer }> = [];
    const uploadProvider = {
      uploadDirect: async ({
        key,
        body,
      }: {
        key: string;
        body: string | Buffer;
      }) => {
        uploads.push({ key, body });
      },
    } as unknown as FileStorageProvider;
    const webId = "00000000-0000-4000-8000-000000000001" as WebId;
    const plan = planSupplyChainDatasetImport({
      sourceDir,
      version: "local-test",
    });

    await uploadSupplyChainDataset({ plan, uploadProvider, webId });

    const sitesUpload = uploads.find(
      ({ key }) =>
        key === `analysis/${webId}/supply-chain/local-test/sites.json`,
    );
    expect(JSON.parse(String(sitesUpload?.body))).toEqual([]);
  });
});
