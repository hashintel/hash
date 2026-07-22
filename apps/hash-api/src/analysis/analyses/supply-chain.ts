import { AnalysisNotFoundError } from "../shared/errors";
import { requireSlugArg } from "../shared/storage-key";
import { resolveDataset } from "./supply-chain/dataset";

import type { NamedAnalysis } from "../shared/analysis-registry";

/**
 * Named analyses backing the supply chain views. Every analysis is scoped to
 * a single web (the dataset owner) and resolves to one or more JSON artifacts.
 *
 * Storage layout (under `analysis/{webId}/supply-chain/{version}/`):
 *   products.json
 *   sites.json
 *   {productId}/graph.json
 *   {productId}/production_schedule.json
 *   {productId}/steps/{stepId}.json
 *   _global/supplier_performance.json
 *   _global/supplier-lines.json
 *   site/{siteId}/summary.json
 */

const listProducts: NamedAnalysis = {
  name: "listProducts",
  resolve: async (ctx) => {
    const { base } = await resolveDataset(ctx);
    return {
      status: "ready",
      artifacts: [{ name: "products", key: `${base}/products.json` }],
    };
  },
};

const listSites: NamedAnalysis = {
  name: "listSites",
  resolve: async (ctx) => {
    const { base } = await resolveDataset(ctx);
    return {
      status: "ready",
      artifacts: [{ name: "sites", key: `${base}/sites.json` }],
    };
  },
};

const productGraph: NamedAnalysis = {
  name: "productGraph",
  resolve: async (ctx) => {
    const productId = requireSlugArg(ctx.args, "productId");
    const { base, manifest } = await resolveDataset(ctx);

    if (!manifest.products.includes(productId)) {
      throw new AnalysisNotFoundError(`Unknown product "${productId}"`);
    }

    return {
      status: "ready",
      artifacts: [{ name: "graph", key: `${base}/${productId}/graph.json` }],
    };
  },
};

const productionSchedule: NamedAnalysis = {
  name: "productionSchedule",
  resolve: async (ctx) => {
    const productId = requireSlugArg(ctx.args, "productId");
    const { base, manifest } = await resolveDataset(ctx);

    // Fail closed for old/partial datasets: product membership alone is not
    // evidence that the optional schedule artifact was published.
    if (!(manifest.productionSchedules ?? []).includes(productId)) {
      throw new AnalysisNotFoundError(
        `Production schedule unavailable for product "${productId}"`,
      );
    }

    return {
      status: "ready",
      artifacts: [
        {
          name: "schedule",
          key: `${base}/${productId}/production_schedule.json`,
        },
      ],
    };
  },
};

const stepDetail: NamedAnalysis = {
  name: "stepDetail",
  resolve: async (ctx) => {
    const productId = requireSlugArg(ctx.args, "productId");
    const stepId = requireSlugArg(ctx.args, "stepId");
    const { base, manifest } = await resolveDataset(ctx);

    if (!manifest.products.includes(productId)) {
      throw new AnalysisNotFoundError(`Unknown product "${productId}"`);
    }
    if (!(manifest.steps[productId] ?? []).includes(stepId)) {
      throw new AnalysisNotFoundError(
        `Unknown step "${stepId}" for product "${productId}"`,
      );
    }

    return {
      status: "ready",
      artifacts: [
        { name: "step", key: `${base}/${productId}/steps/${stepId}.json` },
      ],
    };
  },
};

const supplierPerformance: NamedAnalysis = {
  name: "supplierPerformance",
  resolve: async (ctx) => {
    const { base } = await resolveDataset(ctx);
    return {
      status: "ready",
      artifacts: [
        {
          name: "performance",
          key: `${base}/_global/supplier_performance.json`,
        },
        { name: "lines", key: `${base}/_global/supplier-lines.json` },
      ],
    };
  },
};

const siteSummary: NamedAnalysis = {
  name: "siteSummary",
  resolve: async (ctx) => {
    const siteId = requireSlugArg(ctx.args, "siteId");
    const { base, manifest } = await resolveDataset(ctx);

    if (!manifest.sites.includes(siteId)) {
      throw new AnalysisNotFoundError(`Unknown site "${siteId}"`);
    }

    return {
      status: "ready",
      artifacts: [
        { name: "summary", key: `${base}/site/${siteId}/summary.json` },
      ],
    };
  },
};

export const supplyChainAnalyses: readonly NamedAnalysis[] = [
  listProducts,
  listSites,
  productGraph,
  productionSchedule,
  stepDetail,
  supplierPerformance,
  siteSummary,
];
