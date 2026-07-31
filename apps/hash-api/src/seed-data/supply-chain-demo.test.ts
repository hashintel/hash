import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { parseProductionSchedule } from "@local/hash-isomorphic-utils/production-schedule";
import { parseSiteProductionTimeline } from "@local/hash-isomorphic-utils/site-production-timeline";

import { supplyChainAnalyses } from "../analysis/analyses/supply-chain";
import { planSupplyChainDatasetImport } from "./supply-chain-dataset-import";

import type { AnalysisResolutionContext } from "../analysis/shared/analysis-registry";
import type { WebId } from "@blockprotocol/type-system";

const demoRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "supply-chain-demo",
);

const requiredDwellDetailColumns = [
  "batch",
  "consumption_date",
  "dwell_days",
  "kg_days",
  "cons_matnr",
  "cons_material_name",
  "cons_in_current_recipe",
];

const dwellTypes = new Set([
  "raw_material_dwell",
  "intermediate_dwell",
  "post_qa_ship",
  "destination_dwell",
]);

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function activeDemoDir(): string {
  const current = readJson<{ datasetVersion: string }>(
    path.join(demoRoot, "current.json"),
  );
  return path.join(demoRoot, current.datasetVersion);
}

describe("supply-chain demo data", () => {
  it("publishes only validated optional artifacts listed by the manifest", () => {
    const dataDir = activeDemoDir();
    const manifest = readJson<{
      datasetVersion: string;
      productionSchedules: string[];
      siteProductionTimelines: string[];
    }>(path.join(dataDir, "manifest.json"));
    const products = readJson<Array<{ id: string; site_id: string }>>(
      path.join(dataDir, "products.json"),
    );
    const sites = readJson<Array<{ slug: string }>>(
      path.join(dataDir, "sites.json"),
    );
    const scheduleFiles = products
      .filter(({ id }) =>
        fs.existsSync(path.join(dataDir, id, "production_schedule.json")),
      )
      .map(({ id }) => id)
      .sort();
    const timelineFiles = sites
      .filter(({ slug }) =>
        fs.existsSync(
          path.join(dataDir, "site", slug, "production_timeline.json"),
        ),
      )
      .map(({ slug }) => slug)
      .sort();

    expect(manifest.productionSchedules.toSorted()).toEqual(scheduleFiles);
    expect(manifest.siteProductionTimelines.toSorted()).toEqual(timelineFiles);
    const scheduleDates: string[] = [];
    for (const productId of manifest.productionSchedules) {
      const schedule = parseProductionSchedule(
        readJson(path.join(dataDir, productId, "production_schedule.json")),
        productId,
      );
      for (const lane of schedule.lanes) {
        for (const batch of lane.batches) {
          scheduleDates.push(batch.start, batch.end);
        }
      }
    }
    for (const siteId of manifest.siteProductionTimelines) {
      const timeline = parseSiteProductionTimeline(
        readJson(
          path.join(dataDir, "site", siteId, "production_timeline.json"),
        ),
        siteId,
      );
      expect(timeline.consumption_edges.length).toBeGreaterThan(0);
      expect(timeline.data_quality.edge_count).toBe(
        timeline.consumption_edges.length,
      );
      expect(timeline.data_quality.batches_with_allocation_overage).toBe(0);
      expect(products.some((product) => product.site_id === siteId)).toBe(true);
      expect(timeline.date_bounds.start).not.toBeNull();
      expect(timeline.date_bounds.end).not.toBeNull();
      expect(
        scheduleDates.some((date) => date >= timeline.date_bounds.start!),
      ).toBe(true);
      expect(
        scheduleDates.some((date) => date <= timeline.date_bounds.end!),
      ).toBe(true);
    }

    const plan = planSupplyChainDatasetImport({
      sourceDir: dataDir,
      version: manifest.datasetVersion,
    });
    expect(plan.manifest.productionSchedules).toEqual(
      manifest.productionSchedules,
    );
    expect(plan.manifest.siteProductionTimelines).toEqual(
      manifest.siteProductionTimelines,
    );
  });

  it("resolves the seeded analysis artifact with consumption edges", async () => {
    const dataDir = activeDemoDir();
    const current = fs.readFileSync(path.join(demoRoot, "current.json"));
    const manifest = fs.readFileSync(path.join(dataDir, "manifest.json"));
    const analysis = supplyChainAnalyses.find(
      ({ name }) => name === "siteProductionTimeline",
    );
    expect(analysis).toBeDefined();

    const resolution = await analysis!.resolve({
      args: { siteId: "harbor-roastery" },
      webId: "00000000-0000-4000-8000-000000000001" as WebId,
      loadArtifact: async (key: string) =>
        key.endsWith("/current.json")
          ? current
          : key.endsWith("/manifest.json")
            ? manifest
            : null,
    } as unknown as AnalysisResolutionContext);
    const artifact = resolution.artifacts?.[0];
    expect(artifact?.key).toMatch(
      /2026-07-30\.2\/site\/harbor-roastery\/production_timeline\.json$/,
    );

    const timeline = parseSiteProductionTimeline(
      readJson(
        path.join(
          dataDir,
          "site",
          "harbor-roastery",
          "production_timeline.json",
        ),
      ),
      "harbor-roastery",
    );
    expect(timeline.consumption_edges.length).toBeGreaterThan(0);
  });

  it("keeps the neutral timeline within parse and payload budgets", () => {
    const timelinePath = path.join(
      activeDemoDir(),
      "site",
      "harbor-roastery",
      "production_timeline.json",
    );
    const payload = fs.readFileSync(timelinePath);
    expect(payload.byteLength).toBeLessThan(250_000);
    expect(gzipSync(payload).byteLength).toBeLessThan(50_000);

    const value = JSON.parse(payload.toString("utf8")) as unknown;
    const startedAt = performance.now();
    for (let index = 0; index < 100; index++) {
      parseSiteProductionTimeline(value, "harbor-roastery");
    }
    expect(performance.now() - startedAt).toBeLessThan(2_000);
  });

  it("validates product-attributed dwell details when published", () => {
    const dataDir = activeDemoDir();
    const products = readJson<Array<{ id: string }>>(
      path.join(dataDir, "products.json"),
    );
    let checkedDwellSteps = 0;

    for (const product of products) {
      const graph = readJson<{
        nodes: Array<{ id: string; monthly?: unknown[] }>;
      }>(path.join(dataDir, product.id, "graph.json"));
      const graphNodesById = new Map(
        graph.nodes.map((node) => [node.id, node]),
      );
      const stepsDir = path.join(dataDir, product.id, "steps");
      for (const entry of fs.readdirSync(stepsDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) {
          continue;
        }

        const step = readJson<{
          id: string;
          type: string;
          detail_rows?: {
            columns: Array<{ key: string }>;
            rows: Array<Record<string, unknown>>;
          } | null;
        }>(path.join(stepsDir, entry.name));
        if (!dwellTypes.has(step.type)) {
          continue;
        }
        checkedDwellSteps += 1;

        const detailRows = step.detail_rows;
        if (!detailRows) {
          continue;
        }
        expect(detailRows.rows.length).toBeGreaterThan(0);
        expect(detailRows.columns.map((column) => column.key)).toEqual(
          expect.arrayContaining(requiredDwellDetailColumns),
        );

        const graphNode = graphNodesById.get(step.id);
        expect(graphNode).toBeDefined();
        const kgDaysByMonth = new Map<string, number>();
        for (const row of detailRows.rows) {
          if (
            row.cons_in_current_recipe === 0 ||
            row.cons_in_current_recipe === "0"
          ) {
            continue;
          }
          if (
            typeof row.consumption_date !== "string" ||
            typeof row.kg_days !== "number"
          ) {
            continue;
          }
          const month = row.consumption_date.slice(0, 7);
          kgDaysByMonth.set(
            month,
            (kgDaysByMonth.get(month) ?? 0) + row.kg_days,
          );
        }
        for (const monthly of (graphNode?.monthly ?? []) as Array<
          Record<string, unknown>
        >) {
          if (
            typeof monthly.month === "string" &&
            typeof monthly.total_kg_days === "number"
          ) {
            expect(kgDaysByMonth.get(monthly.month)).toBeCloseTo(
              monthly.total_kg_days,
              0,
            );
          }
        }
      }
    }

    expect(checkedDwellSteps).toBeGreaterThan(0);
  });
});
