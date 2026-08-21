import fs from "node:fs";
import path from "node:path";

import { parseProductionSchedule } from "@local/hash-isomorphic-utils/production-schedule";
import { parseSiteProductionTimeline } from "@local/hash-isomorphic-utils/site-production-timeline";

import { isValidSlug, webScopedKey } from "../analysis/shared/storage-key";

import type { WebId } from "@blockprotocol/type-system";
import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";

const STORAGE_NAMESPACE = "supply-chain";

type JsonObject = Record<string, unknown>;

export interface SupplyChainImportProduct {
  id: string;
  name?: unknown;
  material?: unknown;
}

export interface SupplyChainImportSite {
  slug: string;
  name?: unknown;
}

export interface SupplyChainManifest {
  datasetVersion: string;
  products: string[];
  productionSchedules: string[];
  siteProductionTimelines?: string[];
  sites: string[];
  steps: Record<string, string[]>;
}

type SourceManifest = Partial<
  Pick<SupplyChainManifest, "productionSchedules" | "siteProductionTimelines">
>;

export interface SupplyChainDatasetPlan {
  sourceDir: string;
  version: string;
  products: SupplyChainImportProduct[];
  sites: SupplyChainImportSite[];
  manifest: SupplyChainManifest;
  files: Array<{
    absPath: string;
    relKey: string;
  }>;
}

export interface SupplyChainDatasetUploadResult {
  uploadedFiles: number;
  products: number;
  sites: number;
  steps: number;
}

const readJson = <T>(filePath: string): T => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch (error) {
    throw new Error(
      `Could not read valid JSON from ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};

const assertValidSlug = (value: unknown, label: string): string => {
  if (!isValidSlug(value)) {
    throw new Error(`${label} must be a valid storage slug; received ${value}`);
  }
  return value;
};

const assertJsonArray = <T>(
  value: unknown,
  label: string,
  isItem: (item: unknown) => item is T,
): T[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be a JSON array`);
  }

  for (const [index, item] of value.entries()) {
    if (!isItem(item)) {
      throw new Error(`${label}[${index}] has an invalid shape`);
    }
  }

  return value;
};

const isProduct = (value: unknown): value is SupplyChainImportProduct =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as JsonObject).id === "string";

const isSite = (value: unknown): value is SupplyChainImportSite =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as JsonObject).slug === "string";

const collectJsonFiles = (dir: string): string[] => {
  const out: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectJsonFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      out.push(full);
    }
  }

  return out;
};

const relKeyFor = (sourceDir: string, absPath: string): string =>
  path.relative(sourceDir, absPath).split(path.sep).join("/");

const shouldUploadSourceFile = (relKey: string): boolean =>
  relKey !== "current.json" && relKey !== "manifest.json";

const readOptionalArtifactAllowList = ({
  allowedIds,
  field,
  manifest,
}: {
  allowedIds: ReadonlySet<string>;
  field: keyof SourceManifest;
  manifest: SourceManifest | null;
}): string[] => {
  const value = manifest?.[field];
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`manifest.json ${field} must be an array`);
  }
  const ids = value.map((id) => assertValidSlug(id, `manifest.json ${field}`));
  if (new Set(ids).size !== ids.length) {
    throw new Error(`manifest.json ${field} contains duplicate ids`);
  }
  for (const id of ids) {
    if (!allowedIds.has(id)) {
      throw new Error(`manifest.json ${field} contains unknown id "${id}"`);
    }
  }
  return ids;
};

export const defaultSupplyChainDatasetVersion = (now = new Date()): string => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `local-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(
    now.getUTCDate(),
  )}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(
    now.getUTCSeconds(),
  )}`;
};

export const planSupplyChainDatasetImport = (params: {
  sourceDir: string;
  version: string;
}): SupplyChainDatasetPlan => {
  const sourceDir = path.resolve(params.sourceDir);
  const version = assertValidSlug(params.version, "Dataset version");

  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    throw new Error(`Source directory does not exist: ${sourceDir}`);
  }

  const productsPath = path.join(sourceDir, "products.json");
  if (!fs.existsSync(productsPath)) {
    throw new Error(
      `Source dataset must contain products.json: ${productsPath}`,
    );
  }

  const products = assertJsonArray(
    readJson<unknown>(productsPath),
    "products.json",
    isProduct,
  );
  const productIds = products.map((product) =>
    assertValidSlug(product.id, "Product id"),
  );

  if (new Set(productIds).size !== productIds.length) {
    throw new Error("products.json contains duplicate product ids");
  }

  const sitesPath = path.join(sourceDir, "sites.json");
  const sites = fs.existsSync(sitesPath)
    ? assertJsonArray(readJson<unknown>(sitesPath), "sites.json", isSite)
    : [];
  const siteIds = sites.map((site) => assertValidSlug(site.slug, "Site slug"));

  if (new Set(siteIds).size !== siteIds.length) {
    throw new Error("sites.json contains duplicate site slugs");
  }

  const sourceManifestPath = path.join(sourceDir, "manifest.json");
  const sourceManifest = fs.existsSync(sourceManifestPath)
    ? readJson<SourceManifest>(sourceManifestPath)
    : null;
  const productionSchedules = readOptionalArtifactAllowList({
    allowedIds: new Set(productIds),
    field: "productionSchedules",
    manifest: sourceManifest,
  });
  const siteProductionTimelines = readOptionalArtifactAllowList({
    allowedIds: new Set(siteIds),
    field: "siteProductionTimelines",
    manifest: sourceManifest,
  });
  const productionScheduleSet = new Set(productionSchedules);
  const siteProductionTimelineSet = new Set(siteProductionTimelines);

  const steps: Record<string, string[]> = {};

  for (const productId of productIds) {
    const graphPath = path.join(sourceDir, productId, "graph.json");
    if (!fs.existsSync(graphPath)) {
      throw new Error(`Product "${productId}" is missing graph.json`);
    }

    const stepsDir = path.join(sourceDir, productId, "steps");
    const stepIds = fs.existsSync(stepsDir)
      ? fs
          .readdirSync(stepsDir, { withFileTypes: true })
          .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
          .map((entry) => path.basename(entry.name, ".json"))
          .map((stepId) => assertValidSlug(stepId, "Step id"))
          .sort()
      : [];

    if (new Set(stepIds).size !== stepIds.length) {
      throw new Error(`Product "${productId}" contains duplicate step ids`);
    }

    steps[productId] = stepIds;
    const schedulePath = path.join(
      sourceDir,
      productId,
      "production_schedule.json",
    );
    if (!productionScheduleSet.has(productId)) {
      continue;
    }
    if (!fs.existsSync(schedulePath) || !fs.statSync(schedulePath).isFile()) {
      throw new Error(
        `Product "${productId}" advertises a missing production_schedule.json`,
      );
    }
    try {
      parseProductionSchedule(readJson<unknown>(schedulePath), productId);
    } catch (error) {
      throw new Error(
        `Product "${productId}" has an invalid production_schedule.json: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
  }

  for (const siteId of siteProductionTimelines) {
    const timelinePath = path.join(
      sourceDir,
      "site",
      siteId,
      "production_timeline.json",
    );
    if (!fs.existsSync(timelinePath) || !fs.statSync(timelinePath).isFile()) {
      throw new Error(
        `Site "${siteId}" advertises a missing production_timeline.json`,
      );
    }
    try {
      parseSiteProductionTimeline(readJson<unknown>(timelinePath), siteId);
    } catch (error) {
      throw new Error(
        `Site "${siteId}" has an invalid production_timeline.json: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
  }

  const files = collectJsonFiles(sourceDir)
    .map((absPath) => ({ absPath, relKey: relKeyFor(sourceDir, absPath) }))
    .filter(({ relKey }) => shouldUploadSourceFile(relKey))
    .filter(({ relKey }) => {
      const schedule = /^([^/]+)\/production_schedule\.json$/.exec(relKey);
      if (schedule) {
        return productionScheduleSet.has(schedule[1]!);
      }
      const timeline = /^site\/([^/]+)\/production_timeline\.json$/.exec(
        relKey,
      );
      return !timeline || siteProductionTimelineSet.has(timeline[1]!);
    })
    .sort((left, right) => left.relKey.localeCompare(right.relKey));

  return {
    sourceDir,
    version,
    products,
    sites,
    manifest: {
      datasetVersion: version,
      products: productIds,
      productionSchedules,
      siteProductionTimelines,
      sites: siteIds,
      steps,
    },
    files,
  };
};

export const uploadSupplyChainDataset = async (params: {
  plan: SupplyChainDatasetPlan;
  uploadProvider: FileStorageProvider;
  webId: WebId;
}): Promise<SupplyChainDatasetUploadResult> => {
  const { plan, uploadProvider, webId } = params;
  let uploadedFiles = 0;

  const uploadJson = async (relKey: string, value: unknown) => {
    await uploadProvider.uploadDirect({
      key: webScopedKey(webId, STORAGE_NAMESPACE, relKey),
      body: `${JSON.stringify(value, null, 2)}\n`,
      contentType: "application/json",
    });
    uploadedFiles += 1;
  };

  for (const { absPath, relKey } of plan.files) {
    await uploadProvider.uploadDirect({
      key: webScopedKey(webId, STORAGE_NAMESPACE, plan.version, relKey),
      body: await fs.promises.readFile(absPath),
      contentType: "application/json",
    });
    uploadedFiles += 1;
  }

  if (!plan.files.some(({ relKey }) => relKey === "sites.json")) {
    await uploadJson(`${plan.version}/sites.json`, plan.sites);
  }

  await uploadJson(`${plan.version}/manifest.json`, plan.manifest);
  await uploadJson("current.json", { datasetVersion: plan.version });

  return {
    uploadedFiles,
    products: plan.manifest.products.length,
    sites: plan.manifest.sites.length,
    steps: Object.values(plan.manifest.steps).reduce(
      (sum, productSteps) => sum + productSteps.length,
      0,
    ),
  };
};
