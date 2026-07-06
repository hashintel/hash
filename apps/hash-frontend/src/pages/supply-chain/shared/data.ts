import { fetchArtifactJson } from "../../../shared/analysis-client";
import { isDwellType } from "./categories";
import {
  ensureGraphStats,
  ensureNodeStats,
  ensureStepStats,
} from "./normalize-contract";
import {
  dwellStepScopesOpenCarryOnProduct,
  scopeDwellNodeToProduct,
} from "./product-dwell-scope";
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
  RawGraphData,
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
let productsCache: Promise<Product[]> | null = null;

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
  productsCache = null;
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
  productsCache =
    productsCache ??
    (fetchAnalysisProducts(getActiveWebId()) as Promise<Product[]>);
  return productsCache;
}

/**
 * Site registry used to populate the scope picker and resolve display names.
 * Returns an empty list when unavailable.
 */
export function fetchSites(): Promise<SiteRef[]> {
  return fetchAnalysisSites(getActiveWebId());
}

/**
 * Load a product graph. With the v1 data contract the generator emits the
 * final node/segment shape, so the loader is a straight typed fetch with a
 * normalization pass for older optional fields.
 */
export async function fetchGraph(productId: string): Promise<GraphData> {
  const webId = getActiveWebId();
  const graph = ensureGraphStats(
    await fetchAnalysisGraph<RawGraphData>(webId, productId),
  );
  const products = await fetchProducts();
  const product = products.find((candidate) => candidate.id === productId);

  if (!product) {
    return graph;
  }

  const scopedNodes = await Promise.all(
    graph.nodes.map(async (node) => {
      if (!isDwellType(node.type)) {
        return node;
      }
      try {
        const step = ensureStepStats(
          await fetchAnalysisStepDetail<StepDetail>(webId, productId, node.id),
        );

        return scopeDwellNodeToProduct(
          node,
          step,
          {
            productMaterial: product.material,
            productName: graph.product_name,
          },

          // FG-specific dwell (post-QA / destination) scopes open carry into the
          // product view; shared raw/intermediate dwell stays realized-only for simplicity,
          // as we can't guarantee which FG the material will be consumed by.
          //
          // A future enhancement could assign open inventory where a material reservation exists,
          // or where we know a material is only consumed by one FG, but this might be confusing to users,
          // versus 'always go to the site overview for a full picture of inventory carrying costs'.
          { includeOpenCarry: dwellStepScopesOpenCarryOnProduct(node.type) },
        );
      } catch {
        return node;
      }
    }),
  );

  return { ...graph, nodes: scopedNodes };
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
 */
export function fetchSiteSummary(siteId: string): Promise<SiteSummary> {
  return fetchAnalysisSiteSummary<SiteSummary>(getActiveWebId(), siteId);
}

/**
 * Build the `SiteData` the overview consumes from the precomputed
 * `site/{id}/summary.json` (one request, full v1 nodes embedded), adapting it
 * into the `{ graphs: [{ product, graph }] }` shape the aggregation helpers
 * expect. The summary is always published, so a failed fetch throws rather than
 * silently degrading. An empty product set is valid and renders an empty shell.
 */
export async function fetchSiteData(siteId: string): Promise<SiteData> {
  const summary = await fetchSiteSummary(siteId);
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
  const pending = fetchSiteData(siteId);
  siteDataCache.set(key, pending);
  pending.catch(() => siteDataCache.delete(key));
  return pending;
}

export { fetchArtifactJson };
