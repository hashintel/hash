import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

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
  it("ships product-attributed detail rows for dwell step artifacts", () => {
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
        expect(detailRows).toBeDefined();
        expect(detailRows?.rows.length).toBeGreaterThan(0);
        expect(detailRows?.columns.map((column) => column.key)).toEqual(
          expect.arrayContaining(requiredDwellDetailColumns),
        );

        const graphNode = graphNodesById.get(step.id);
        expect(graphNode).toBeDefined();
        const kgDaysByMonth = new Map<string, number>();
        for (const row of detailRows?.rows ?? []) {
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
