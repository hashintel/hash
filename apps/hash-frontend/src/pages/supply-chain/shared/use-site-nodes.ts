import { useEffect, useMemo, useState } from "react";

import { fetchSiteDataCached } from "./data";
import { deduplicateNodes } from "./site-aggregation";

import type { Product, SiteData, SiteNode } from "./types";

export interface SiteNodesResult {
  /** Raw fetched site data (null until the first load resolves). */
  siteData: SiteData | null;
  /** De-duplicated site nodes, memoised so callers never re-run the dedup. */
  nodes: SiteNode[];
  loading: boolean;
  error: string | null;
}

/**
 * Single shared path for loading a site's graphs and de-duplicating its nodes.
 * Used by both `SiteOverview` and `OpportunityBrief` so the fetch + dedup happen
 * once (the underlying `fetchSiteDataCached` memoises the request for the
 * session). `deduplicateNodes` is memoised on `siteData` so the dedup runs once
 * per load rather than on every render.
 */
export function useSiteNodes(
  siteId: string,
  products: Product[],
): SiteNodesResult {
  const [siteData, setSiteData] = useState<SiteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSiteDataCached(siteId, products)
      .then((data) => {
        if (!cancelled) {
          setSiteData(data);
        }
      })
      .catch((event) => {
        if (!cancelled) {
          setError(event instanceof Error ? event.message : String(event));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [siteId, products]);

  const nodes = useMemo(
    () => (siteData ? deduplicateNodes(siteData) : []),
    [siteData],
  );

  return { siteData, nodes, loading, error };
}
