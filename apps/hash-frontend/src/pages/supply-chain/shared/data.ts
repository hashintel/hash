import { fetchArtifactJson } from "../../../shared/analysis-client";
import {
  ensureGraphStats,
  ensureNodeStats,
  ensureStepStats,
} from "./normalize-contract";
import {
  fetchGraph as fetchAnalysisGraph,
  fetchProducts as fetchAnalysisProducts,
  fetchSiteSummary as fetchAnalysisSiteSummary,
  fetchSites as fetchAnalysisSites,
  fetchStepDetail as fetchAnalysisStepDetail,
  fetchSupplierPerformance as fetchAnalysisSupplierPerformance,
} from "./supply-chain-analysis-requests";

import type {
  Product,
  GraphData,
  StepDetail,
  StepDetailWire,
  SiteData,
  SiteSupplierPerformance,
  SiteSummary,
} from "./types";
import type { WebId } from "@blockprotocol/type-system";

/** A selectable site with its data slug and display name. */
export interface SiteRef {
  slug: string;
  name: string;
}

let activeWebId: WebId | null = null;

/**
 * Session cache for `fetchSiteData`, keyed by web + site + product set. A
 * rejected promise is evicted so a later mount can retry.
 */
const siteDataCache = new Map<string, Promise<SiteData>>();
/**
 * Site-wide supplier performance. Cached for the session; missing optional
 * artifacts resolve to `null`, so the cache holds at most one resolved promise.
 */
let supplierPerformanceCache: Promise<SiteSupplierPerformance | null> | null =
  null;
/**
 * Configure the workspace web whose published analysis artifacts back the
 * supply-chain views. All data reads go through HASH's analysis gateway.
 */
export function configureDataSource({
  scope,
}: {
  scope: WebId | string;
}): void {
  activeWebId = scope as WebId;
  supplierPerformanceCache = null;
  siteDataCache.clear();
}
const getActiveWebId = (): WebId => {
  if (!activeWebId) {
    throw new Error("Supply-chain data source is not configured.");
  }
  return activeWebId;
};
export function fetchProducts(): Promise<Product[]> {
  return fetchAnalysisProducts(getActiveWebId()) as Promise<Product[]>;
}
/**
 * Site registry used to populate the scope picker and resolve display names.
 * Returns an empty list when unavailable.
 */ export function fetchSites(): Promise<SiteRef[]> {
  return fetchAnalysisSites(getActiveWebId());
}
/**
 * Load a product graph. With the v1 data contract the generator emits the
 * final node/segment shape, so the loader is a straight typed fetch with a
 * normalization pass for older optional fields.
 */ export function fetchGraph(productId: string): Promise<GraphData> {
  return fetchAnalysisGraph<GraphData>(getActiveWebId(), productId).then(
    ensureGraphStats,
  );
}
export async function fetchAllGraphs(products: Product[]): Promise<SiteData> {
  const graphs = await Promise.all(
    products.map((product) =>
      fetchGraph(product.id).then((graph) => ({ product, graph })),
    ),
  );
  return {
    analysis_settings:
      graphs.find(({ graph }) => graph.analysis_settings)?.graph
        .analysis_settings ?? null,
    graphs,
  };
}
export function fetchSupplierPerformance(): Promise<SiteSupplierPerformance | null> {
  if (supplierPerformanceCache) {
    return supplierPerformanceCache;
  }
  supplierPerformanceCache =
    fetchAnalysisSupplierPerformance<SiteSupplierPerformance>(getActiveWebId());
  return supplierPerformanceCache;
}
export function fetchStepDetail(
  productId: string,
  stepId: string,
): Promise<StepDetail> {
  return fetchAnalysisStepDetail<StepDetailWire>(
    getActiveWebId(),
    productId,
    stepId,
  ).then(ensureStepStats);
}
/**
 * Site overview summary. Precomputed per site so the overview never has to
 * fetch every product's full graph.
 */ export function fetchSiteSummary(
  siteId: string,
): Promise<SiteSummary | null> {
  return fetchAnalysisSiteSummary<SiteSummary>(getActiveWebId(), siteId);
}
/**
 * Build the `SiteData` the overview consumes. Prefers the precomputed
 * `site/{id}/summary.json` (one request, full v1 nodes embedded) and adapts it
 * into the `{ graphs: [{ product, graph }] }` shape the aggregation helpers
 * expect. Falls back to fetching every product's full graph only when no
 * summary is published.
 */ export async function fetchSiteData(
  siteId: string,
  products: Product[],
): Promise<SiteData> {
  const summary = await fetchSiteSummary(siteId);
  if (summary && summary.products.length > 0) {
    return {
      analysis_settings: summary.analysis_settings ?? null,
      graphs: summary.products.map((product) => ({
        product: { id: product.id, name: product.name, material: "" },
        graph: {
          schema_version: summary.schema_version,
          product_id: product.id,
          product_name: product.name,
          nodes: product.nodes.map(ensureNodeStats),
          edges: [],
          pipeline_summary: {},
        },
      })),
    };
  }
  return fetchAllGraphs(products);
}
export function fetchSiteDataCached(
  siteId: string,
  products: Product[],
): Promise<SiteData> {
  const key = `${getActiveWebId()}::${siteId}::${products
    .map((product) => product.id)
    .sort()
    .join(",")}`;
  const cached = siteDataCache.get(key);
  if (cached) {
    return cached;
  }
  const pending = fetchSiteData(siteId, products);
  siteDataCache.set(key, pending);
  pending.catch(() => siteDataCache.delete(key));
  return pending;
}

export { fetchArtifactJson };
