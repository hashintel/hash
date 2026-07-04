import {
  fetchAnalysisArtifact,
  fetchAnalysisArtifacts,
  fetchArtifactJson,
  runAnalyses,
} from "../../../shared/analysis-client";

import type { WebId } from "@blockprotocol/type-system";

/**
 * Data-access layer for the supply-chain views.
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
  fetchAnalysisArtifact<SupplyChainProduct[]>({
    analysis: "listProducts",
    webId,
  });

export const fetchSites = (webId: WebId): Promise<SiteRef[]> =>
  fetchAnalysisArtifact<SiteRef[]>({
    analysis: "listSites",
    webId,
  }).catch(() => []);

export const fetchGraph = <Graph = unknown>(
  webId: WebId,
  productId: string,
): Promise<Graph> =>
  fetchAnalysisArtifact<Graph>({
    analysis: "productGraph",
    args: { productId },
    webId,
  });

export const fetchStepDetail = <StepDetail = unknown>(
  webId: WebId,
  productId: string,
  stepId: string,
): Promise<StepDetail> =>
  fetchAnalysisArtifact<StepDetail>({
    analysis: "stepDetail",
    args: { productId, stepId },
    webId,
  });

export const fetchSiteSummary = async <SiteSummary = unknown>(
  webId: WebId,
  siteId: string,
): Promise<SiteSummary> => {
  try {
    return await fetchAnalysisArtifact<SiteSummary>({
      analysis: "siteSummary",
      args: { siteId },
      webId,
    });
  } catch (cause) {
    throw new Error("Could not fetch site summary data", { cause });
  }
};

/**
 * Site-wide supplier performance. The analysis resolves two artifacts –
 * `performance` (aggregates) and `lines` (raw schedule lines for client-side
 * time-window recompute). We re-attach `lines` onto the performance payload to
 * match the `SiteSupplierPerformance` shape. Missing lines are tolerated.
 */
export const fetchSupplierPerformance = async <
  Performance extends { lines?: unknown[] } = { lines?: unknown[] },
  Line = unknown,
>(
  webId: WebId,
): Promise<Performance | null> => {
  try {
    const artifacts = await fetchAnalysisArtifacts({
      analysis: "supplierPerformance",
      webId,
    });

    const perfRef = artifacts.performance;
    if (!perfRef) {
      return null;
    }
    const performance = await fetchArtifactJson<Performance>(perfRef);

    if (
      (!performance.lines || performance.lines.length === 0) &&
      artifacts.lines
    ) {
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

export const resolveSupplyChainDataWebId = async ({
  candidateWebIds,
}: {
  candidateWebIds: WebId[];
}): Promise<WebId | null> => {
  const uniqueCandidateWebIds = [...new Set(candidateWebIds)];

  if (uniqueCandidateWebIds.length === 0) {
    return null;
  }

  const results = await runAnalyses(
    uniqueCandidateWebIds.map((webId, index) => ({
      id: `list-products-${index}`,
      analysis: "listProducts",
      webId,
    })),
  );

  const productsByWebId = await Promise.all(
    uniqueCandidateWebIds.map(async (webId, index) => {
      const result = results[index];

      if (result?.status !== "ready" || !result.artifacts?.[0]) {
        return { products: [] as SupplyChainProduct[], webId };
      }

      try {
        return {
          products: await fetchArtifactJson<SupplyChainProduct[]>(
            result.artifacts[0],
          ),
          webId,
        };
      } catch {
        return { products: [] as SupplyChainProduct[], webId };
      }
    }),
  );

  return (
    productsByWebId.find(({ products }) => products.length > 0)?.webId ?? null
  );
};
