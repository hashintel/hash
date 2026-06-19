import { QueryNotFoundError } from "../shared/errors";
import { requireSlugArg } from "../shared/storage-key";
import { resolveDataset } from "./supply-chain/dataset";

import type { NamedQuery } from "../shared/query-registry";

/**
 * Named queries backing the value-chain-timing views. Every query is scoped to
 * a single web (the dataset owner) and resolves to one or more JSON artifacts.
 *
 * Storage layout (under `supply-chain/{webId}/{version}/`):
 *   products.json
 *   sites.json
 *   {productId}/graph.json
 *   {productId}/steps/{stepId}.json
 *   _global/supplier_performance.json
 *   _global/supplier-lines.json
 *   site/{siteId}/summary.json
 */

const listProducts: NamedQuery = {
  name: "listProducts",
  resolve: async (ctx) => {
    const { base } = await resolveDataset(ctx);
    return {
      status: "ready",
      artifacts: [{ name: "products", key: `${base}/products.json` }],
    };
  },
};

const listSites: NamedQuery = {
  name: "listSites",
  resolve: async (ctx) => {
    const { base } = await resolveDataset(ctx);
    return {
      status: "ready",
      artifacts: [{ name: "sites", key: `${base}/sites.json` }],
    };
  },
};

const productGraph: NamedQuery = {
  name: "productGraph",
  resolve: async (ctx) => {
    const productId = requireSlugArg(ctx.args, "productId");
    const { base, manifest } = await resolveDataset(ctx);

    if (!manifest.products.includes(productId)) {
      throw new QueryNotFoundError(`Unknown product "${productId}"`);
    }

    return {
      status: "ready",
      artifacts: [{ name: "graph", key: `${base}/${productId}/graph.json` }],
    };
  },
};

const stepDetail: NamedQuery = {
  name: "stepDetail",
  resolve: async (ctx) => {
    const productId = requireSlugArg(ctx.args, "productId");
    const stepId = requireSlugArg(ctx.args, "stepId");
    const { base, manifest } = await resolveDataset(ctx);

    if (!manifest.products.includes(productId)) {
      throw new QueryNotFoundError(`Unknown product "${productId}"`);
    }
    if (!(manifest.steps[productId] ?? []).includes(stepId)) {
      throw new QueryNotFoundError(
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

const supplierPerformance: NamedQuery = {
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

const siteSummary: NamedQuery = {
  name: "siteSummary",
  resolve: async (ctx) => {
    const siteId = requireSlugArg(ctx.args, "siteId");
    const { base, manifest } = await resolveDataset(ctx);

    if (!manifest.sites.includes(siteId)) {
      throw new QueryNotFoundError(`Unknown site "${siteId}"`);
    }

    return {
      status: "ready",
      artifacts: [
        { name: "summary", key: `${base}/site/${siteId}/summary.json` },
      ],
    };
  },
};

export const supplyChainQueries: readonly NamedQuery[] = [
  listProducts,
  listSites,
  productGraph,
  stepDetail,
  supplierPerformance,
  siteSummary,
];
