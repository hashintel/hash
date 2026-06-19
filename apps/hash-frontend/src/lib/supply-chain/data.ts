import {
  fetchArtifactJson,
  fetchQueryArtifact,
  fetchQueryArtifacts,
} from "./query-client";

import type { WebId } from "@blockprotocol/type-system";

/**
 * Data-access layer for the supply-chain (value-chain-timing) views, ported
 * from the standalone SPA's `shared/data.ts`. Where the SPA fetched static JSON
 * from `/data/...`, these go through the auth-gated query gateway, scoped to a
 * `webId`. View-layer payload types (graph, step detail, site summary) are
 * supplied by the caller as type parameters during the component migration.
 */

/** A product as listed in `products.json`. */
export interface SupplyChainProduct {
  id: string;
  name: string;
  material: string;
}

/** A selectable site (plant) as listed in `sites.json`. */
export interface SiteRef {
  slug: string;
  name: string;
}

export const fetchProducts = (webId: WebId): Promise<SupplyChainProduct[]> =>
  fetchQueryArtifact<SupplyChainProduct[]>({
    query: "listProducts",
    webIds: [webId],
  });

export const fetchSites = (webId: WebId): Promise<SiteRef[]> =>
  fetchQueryArtifact<SiteRef[]>({
    query: "listSites",
    webIds: [webId],
  }).catch(() => []);

export const fetchGraph = <Graph = unknown>(
  webId: WebId,
  productId: string,
): Promise<Graph> =>
  fetchQueryArtifact<Graph>({
    query: "productGraph",
    args: { productId },
    webIds: [webId],
  });

export const fetchStepDetail = <StepDetail = unknown>(
  webId: WebId,
  productId: string,
  stepId: string,
): Promise<StepDetail> =>
  fetchQueryArtifact<StepDetail>({
    query: "stepDetail",
    args: { productId, stepId },
    webIds: [webId],
  });

export const fetchSiteSummary = async <SiteSummary = unknown>(
  webId: WebId,
  siteId: string,
): Promise<SiteSummary | null> => {
  try {
    return await fetchQueryArtifact<SiteSummary>({
      query: "siteSummary",
      args: { siteId },
      webIds: [webId],
    });
  } catch {
    return null;
  }
};

/**
 * Site-wide supplier performance. The query resolves two artifacts –
 * `performance` (aggregates) and `lines` (raw schedule lines for client-side
 * time-window recompute). We re-attach `lines` onto the performance payload to
 * match the SPA's `SiteSupplierPerformance` shape. Missing lines are tolerated.
 */
export const fetchSupplierPerformance = async <
  Performance extends { lines?: unknown[] } = { lines?: unknown[] },
  Line = unknown,
>(
  webId: WebId,
): Promise<Performance | null> => {
  try {
    const artifacts = await fetchQueryArtifacts({
      query: "supplierPerformance",
      webIds: [webId],
    });

    const perfRef = artifacts.performance;
    if (!perfRef) {
      return null;
    }
    const performance = await fetchArtifactJson<Performance>(perfRef);

    if (!performance.lines && artifacts.lines) {
      try {
        const companion = await fetchArtifactJson<{ lines?: Line[] }>(
          artifacts.lines,
        );
        if (companion.lines) {
          performance.lines = companion.lines;
        }
      } catch {
        // Companion lines file absent: leave aggregates-only.
      }
    }

    return performance;
  } catch {
    return null;
  }
};
