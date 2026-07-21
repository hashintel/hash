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
        artifact_type: "production_schedule",
        artifact_version: scheduleVersion,
        product_id: "demo-product",
        lanes: [
          {
            material: "1000",
            name: "Demo Product",
            bom_depth: 0,
            role: "finished_good",
            campaigns: [],
            batches: [],
          },
        ],
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

  it("accepts future production schedule versions with a valid shape", () => {
    const plan = planSupplyChainDatasetImport({
      sourceDir: makeDataset("2.0"),
      version: "local-test",
    });

    expect(plan.manifest.productionSchedules).toEqual(["demo-product"]);
  });

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
