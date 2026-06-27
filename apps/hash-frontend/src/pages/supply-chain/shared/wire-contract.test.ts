import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const dataDir = fileURLToPath(
  new URL("../../../../../public/data/", import.meta.url),
);
const hasFixtureData = existsSync(path.join(dataDir, "products.json"));

function loadJson<T>(relativePath: string): T {
  return JSON.parse(
    readFileSync(path.join(dataDir, relativePath), "utf8"),
  ) as T;
}

/**
 * Discover fixtures from the published manifest rather than hardcoding a
 * product slug: this keeps client-specific product names out of the test and
 * self-heals when individual step files are regenerated/removed.
 */
function discoverFixtures(): {
  productId: string;
  procurementStep: string;
  timingStep: string;
} {
  const products = loadJson<Array<{ id: string }>>("products.json");
  for (const product of products) {
    if (product.id.startsWith("_")) {
      continue;
    }
    const stepsDir = path.join(dataDir, product.id, "steps");
    if (
      !existsSync(path.join(dataDir, product.id, "graph.json")) ||
      !existsSync(stepsDir)
    ) {
      continue;
    }
    const stepFiles = readdirSync(stepsDir).filter((fraction) =>
      fraction.endsWith(".json"),
    );
    const procurementStep = stepFiles.find((fraction) =>
      fraction.startsWith("procurement_"),
    );
    const timingStep = stepFiles.find((fraction) => {
      if (fraction.startsWith("procurement_")) {
        return false;
      }
      const payload = loadJson<Record<string, unknown>>(
        `${product.id}/steps/${fraction}`,
      );
      return (
        "observations" in payload &&
        "monthly" in payload &&
        !("stats" in payload)
      );
    });
    if (procurementStep && timingStep) {
      return { productId: product.id, procurementStep, timingStep };
    }
  }
  throw new Error(
    "No product fixture with a procurement and timing step was found under public/data",
  );
}

function discoverSiteSlug(): string {
  const sites = loadJson<Array<{ slug: string }>>("sites.json");
  const slug = sites[0]?.slug;
  if (!slug) {
    throw new Error("No site fixture found under public/data/sites.json");
  }
  return slug;
}

function expectNoTimingMonthly(bucket: Record<string, unknown>) {
  for (const key of ["mean", "median", "p10", "p25", "p75", "p90"]) {
    expect(bucket).not.toHaveProperty(key);
  }
}

function expectSlimNode(node: Record<string, unknown>) {
  for (const key of [
    "stats",
    "pct_exceeding_plan",
    "complete_series",
    "yield_series",
    "consumption_series",
    "binding",
    "source",
    "n_batches",
    "n_movements",
  ]) {
    expect(node).not.toHaveProperty(key);
  }
  for (const monthly of (node.monthly as
    | Record<string, unknown>[]
    | undefined) ?? []) {
    expectNoTimingMonthly(monthly);
  }
}

function expectCombinedProcurementObservation(obs: Record<string, unknown>) {
  expect(typeof obs.first_receipt_date).toBe("string");
  expect(typeof obs.first_receipt_value).toBe("number");
  expect(typeof obs.last_receipt_date).toBe("string");
  expect(typeof obs.last_receipt_value).toBe("number");
  expect(obs).not.toHaveProperty("date");
  expect(obs).not.toHaveProperty("value");
}

if (!hasFixtureData) {
  describe.skip("wire payload contract", () => {
    it("requires optional static fixture data", () => undefined);
  });
} else {
  describe("wire payload contract", () => {
    const { productId, procurementStep, timingStep } = discoverFixtures();
    const siteSlug = discoverSiteSlug();

    it("keeps site summary nodes raw and slim", () => {
      const summary = loadJson<{
        products: Array<{ nodes: Record<string, unknown>[] }>;
      }>(`site/${siteSlug}/summary.json`);
      const nodes = summary.products.flatMap((product) => product.nodes);
      expect(nodes.length).toBeGreaterThan(0);
      for (const node of nodes.slice(0, 100)) {
        expectSlimNode(node);
      }
    });

    it("keeps product graph nodes stats-free and monthly buckets slim", () => {
      const graph = loadJson<{ nodes: Record<string, unknown>[] }>(
        `${productId}/graph.json`,
      );
      expect(graph.nodes.length).toBeGreaterThan(0);
      for (const node of graph.nodes) {
        expect(node).not.toHaveProperty("stats");
        expect(node).not.toHaveProperty("pct_exceeding_plan");
        for (const monthly of (node.monthly as
          | Record<string, unknown>[]
          | undefined) ?? []) {
          expectNoTimingMonthly(monthly);
        }
        expect(node).not.toHaveProperty("complete_series");
        if (node.type === "procurement") {
          expect(node).not.toHaveProperty("monthly");
          const observations = node.observations as Record<string, unknown>[];
          expect(observations.length).toBeGreaterThan(0);
          const firstObservation = observations[0];
          expect(firstObservation).toBeDefined();
          expectCombinedProcurementObservation(firstObservation!);
        }
      }
    });

    it("keeps step detail derived stats off the wire", () => {
      const procurement = loadJson<Record<string, unknown>>(
        `${productId}/steps/${procurementStep}`,
      );
      for (const key of [
        "stats",
        "durations",
        "observations",
        "monthly",
        "pct_exceeding_plan",
        "complete_timing",
      ]) {
        expect(procurement).not.toHaveProperty(key);
      }
      const detailRows = procurement.detail_rows as {
        columns: Array<{ key: string }>;
        rows: Record<string, unknown>[];
      };
      const colKeys = detailRows.columns.map((column) => column.key);
      expect(colKeys).toContain("last_gr_date");
      expect(colKeys).toContain("lead_time_complete_days");
      expect(detailRows.rows[0]).toHaveProperty("last_gr_date");

      const dwell = loadJson<Record<string, unknown>>(
        `${productId}/steps/${timingStep}`,
      );
      expect(dwell).toHaveProperty("observations");
      expect(dwell).toHaveProperty("monthly");
      expect(dwell).not.toHaveProperty("stats");
      expect(dwell).not.toHaveProperty("durations");
      expect(dwell).not.toHaveProperty("pct_exceeding_plan");
      for (const monthly of (dwell.monthly as
        | Record<string, unknown>[]
        | undefined) ?? []) {
        expectNoTimingMonthly(monthly);
      }
    });

    it("keeps supplier payloads raw-line driven", () => {
      const perf = loadJson<{
        vendors: Record<string, unknown>[];
        lines?: unknown[];
      }>("_global/supplier_performance.json");
      expect(perf).not.toHaveProperty("lines");
      for (const vendor of perf.vendors) {
        expect(vendor).not.toHaveProperty("monthly");
        expect(vendor).not.toHaveProperty("worst_events");
        expect(vendor).not.toHaveProperty("materials");
      }

      const companion = loadJson<{ lines: Record<string, unknown>[] }>(
        "_global/supplier-lines.json",
      );
      expect(companion.lines.length).toBeGreaterThan(0);
      for (const line of companion.lines.slice(0, 100)) {
        expect(line).not.toHaveProperty("on_time");
        expect(line).not.toHaveProperty("in_full");
      }
    });
  });
}
