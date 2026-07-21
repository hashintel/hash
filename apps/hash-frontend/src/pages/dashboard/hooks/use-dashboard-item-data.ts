import { useCallback, useEffect, useRef, useState } from "react";

import {
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";

import {
  fetchArtifactJson,
  runAnalyses,
} from "../../../shared/analysis-client";

import type { EntityId } from "@blockprotocol/type-system";
import type { DashboardItemDataGenerationMetadata } from "@local/hash-isomorphic-utils/dashboard-types";

/** Give up after this many responses. */
const MAX_POLL_ATTEMPTS = 60;

const DEFAULT_RETRY_AFTER_MS = 5_000;

export type DashboardItemDataState = {
  /** The computed chart data, once available */
  data: unknown[] | null;
  /** Whether an initial fetch or recompute poll is in flight */
  loading: boolean;
  error: string | null;
  generatedAt: string | null;
  generationDurationMs: number | null;
  isRefreshing: boolean;
  estimatedProgress: number | null;
  /** Re-fetch, optionally forcing a server-side recompute */
  refresh: (options?: { force?: boolean }) => void;
};

/**
 * Fetch a dashboard item's chart data through the analysis gateway.
 *
 * Data is computed server-side (graph query + Python script) and cached as an
 * artifact; while a computation is in flight the gateway returns `computing`
 * with a retry hint, which this hook polls on.
 */
export const useDashboardItemData = (params: {
  itemEntityId: EntityId;
  /** Only fetch when the item is ready (configured) */
  enabled: boolean;
  /** Changes whenever the query/script producing the chart data changes. */
  configurationKey: string;
}): DashboardItemDataState => {
  const { itemEntityId, enabled, configurationKey } = params;

  const [data, setData] = useState<unknown[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [generationDurationMs, setGenerationDurationMs] = useState<
    number | null
  >(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [estimatedProgress, setEstimatedProgress] = useState<number | null>(
    null,
  );

  /** Increments to invalidate in-flight polling loops (unmount / new request) */
  const requestGenerationRef = useRef(0);

  const fetchData = useCallback(
    async (force: boolean) => {
      const generation = ++requestGenerationRef.current;

      setLoading(true);
      setError(null);
      setIsRefreshing(force);
      setEstimatedProgress(null);
      const generationStartedAt = Date.now();

      const webId = extractWebIdFromEntityId(itemEntityId);
      const itemUuid = extractEntityUuidFromEntityId(itemEntityId);
      let refreshAfter: string | undefined;
      let hasLoadedReadyData = false;

      try {
        for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
          const [result] = await runAnalyses([
            {
              id: "dashboard-item-data",
              analysis: "dashboardItemData",
              webId,
              args: {
                itemUuid,
                // Only force on the first request; polls just check status.
                ...(force && attempt === 0 ? { force: true } : {}),
                ...(refreshAfter ? { refreshAfter } : {}),
              },
            },
          ]);

          if (generation !== requestGenerationRef.current) {
            return;
          }

          if (!result) {
            throw new Error("Empty analysis response");
          }

          if (result.status === "error") {
            throw new Error(result.error ?? "Failed to compute chart data");
          }

          const metadata =
            (result.metadata as
              | DashboardItemDataGenerationMetadata
              | undefined) ?? {};
          if (metadata.generatedAt) {
            setGeneratedAt(metadata.generatedAt);
          }
          if (metadata.generationDurationMs !== undefined) {
            setGenerationDurationMs(metadata.generationDurationMs);
            setEstimatedProgress(
              Math.min(
                95,
                ((Date.now() - generationStartedAt) /
                  metadata.generationDurationMs) *
                  100,
              ),
            );
          }
          refreshAfter = metadata.refreshAfter ?? refreshAfter;
          setIsRefreshing(metadata.isRefreshing === true);

          if (result.status === "ready") {
            const artifact = result.artifacts?.[0];
            if (!artifact) {
              throw new Error("Analysis result missing chart data artifact");
            }
            const chartData = await fetchArtifactJson<unknown[]>(artifact);
            if (generation !== requestGenerationRef.current) {
              return;
            }
            setData(chartData);
            hasLoadedReadyData = true;
            if (!metadata.isRefreshing) {
              setLoading(false);
              setEstimatedProgress(100);
              return;
            }
          }

          // Wait for a computation or stale-while-revalidate refresh.
          await new Promise((resolve) => {
            setTimeout(resolve, result.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS);
          });

          if (generation !== requestGenerationRef.current) {
            return;
          }
        }

        throw new Error("Timed out waiting for chart data computation");
      } catch (err) {
        if (generation !== requestGenerationRef.current) {
          return;
        }

        if (hasLoadedReadyData) {
          setLoading(false);
          setIsRefreshing(false);
          setEstimatedProgress(null);
          return;
        }

        setError(err instanceof Error ? err.message : "Failed to load data");
        setLoading(false);
        setIsRefreshing(false);
        setEstimatedProgress(null);
      }
    },
    [itemEntityId],
  );

  useEffect(() => {
    if (enabled) {
      void fetchData(false);
    }

    return () => {
      // Invalidate any in-flight loop when deps change or on unmount
      requestGenerationRef.current += 1;
    };
  }, [configurationKey, enabled, fetchData]);

  const refresh = useCallback(
    (options?: { force?: boolean }) => {
      void fetchData(options?.force ?? false);
    },
    [fetchData],
  );

  return {
    data,
    loading,
    error,
    generatedAt,
    generationDurationMs,
    isRefreshing,
    estimatedProgress,
    refresh,
  };
};
