import { useEffect, useMemo, useState } from "react";

import { DWELL_TYPES } from "../../shared/categories";
import { useCostParams, useOutlierSetting } from "../../shared/cost";
import { fetchSupplierPerformance } from "../../shared/data";
import { selectStat, useBaseMeasure } from "../../shared/measure-context";
import { applyOutlierSelectionToNode } from "../../shared/outlier-selection";
import {
  computeTimingTrend,
  computeCostTrend,
} from "../../shared/period-trends";
import { useProcurementBasis } from "../../shared/procurement-basis-context";
import {
  windowGraphNodeToRange,
  applyProcurementBasisToNode,
} from "../../shared/range-filter";
import {
  totalSiteDwellCost,
  topDwellCosts,
  countBadPlanningParams,
  computeNodePeriodCost,
} from "../../shared/site-aggregation";
import { siteNodeKey } from "../../shared/site-node-key";
import { recomputeSitePerformance } from "../../shared/supplier-otif";
import { useTimeRange } from "../../shared/time-range-context";
import { useSiteNodes } from "../../shared/use-site-nodes";
import { hasEnoughSample, aggregateMonthlyCarryCost } from "./shared/helpers";

import type {
  Product,
  SiteNode,
  SiteSupplierPerformance,
  VendorOtifStats,
} from "../../shared/types";
import type { SupplierMode } from "./shared/row-types";

interface SiteOverviewRowsInput {
  siteSlug: string;
  products: Product[];
  excludeLowSamples: boolean;
  supplierMode: SupplierMode;
  supplierPerformanceEnabled: boolean;
}

function supplierLeaderboardMin(
  overall: SiteSupplierPerformance["overall"] | null | undefined,
): number {
  return overall?.min_lines_for_leaderboard ?? 3;
}

/**
 * All derived collections for the site overview (dwell / planning / supplier
 * tables + dashboard cards), windowed to the active `timeRange` and the cost /
 * outlier filters. Keeps the page component focused on layout + local UI state.
 */
export function useSiteOverviewRows({
  siteSlug,
  products,
  excludeLowSamples,
  supplierMode,
  supplierPerformanceEnabled,
}: SiteOverviewRowsInput) {
  const { currency, setAnalysisSettings, waccRate, storageCost } =
    useCostParams();
  const { excludeOutliers } = useOutlierSetting();
  const { measure } = useBaseMeasure();
  const { basis: procurementBasis } = useProcurementBasis();
  const { timeRange } = useTimeRange();
  const {
    siteData,
    nodes: dedupedNodes,
    loading,
    error,
  } = useSiteNodes(siteSlug, products);

  const [supplierData, setSupplierData] =
    useState<SiteSupplierPerformance | null>(null);

  useEffect(() => {
    setAnalysisSettings(siteData?.analysis_settings);
  }, [siteData?.analysis_settings, setAnalysisSettings]);

  useEffect(() => {
    if (!supplierPerformanceEnabled) {
      setSupplierData(null);
      return;
    }

    let cancelled = false;
    fetchSupplierPerformance()
      .then((suppliers) => {
        if (!cancelled) {
          setSupplierData(suppliers);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSupplierData(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [supplierPerformanceEnabled]);

  // Outlier selection is applied once here (full history, used for trends);
  // filteredNodes only windows these, so nodes are never double-processed.
  // `dedupedNodes` comes from the shared useSiteNodes hook (one fetch + dedup).
  const historicalNodes = useMemo((): SiteNode[] => {
    return dedupedNodes.map((count) => ({
      ...applyOutlierSelectionToNode(
        applyProcurementBasisToNode(count, procurementBasis),
        excludeOutliers,
      ),
      products: count.products,
    }));
  }, [dedupedNodes, excludeOutliers, procurementBasis]);

  const filteredNodes = useMemo((): SiteNode[] => {
    return historicalNodes.map((count) => ({
      ...windowGraphNodeToRange(count, timeRange),
      products: count.products,
    }));
  }, [historicalNodes, timeRange]);

  const historicalNodesByKey = useMemo(() => {
    return new Map(historicalNodes.map((count) => [siteNodeKey(count), count]));
  }, [historicalNodes]);

  const planningVisibleNodes = useMemo(() => {
    if (!excludeLowSamples) {
      return filteredNodes;
    }
    return filteredNodes.filter((count) => hasEnoughSample(count.stats.n));
  }, [filteredNodes, excludeLowSamples]);

  const summaryStats = useMemo(() => {
    const dwellCost = totalSiteDwellCost(filteredNodes, waccRate, storageCost);
    const badParams = countBadPlanningParams(filteredNodes, measure);
    return { dwellCost: dwellCost > 0 ? dwellCost : null, badParams };
  }, [filteredNodes, waccRate, storageCost, measure]);

  // Site-wide currency for cost formatting: the most common non-null currency
  // across the site's nodes. Falls back to the active dataset/default currency.
  const siteCurrency = useMemo((): string | null => {
    const counts = new Map<string, number>();
    for (const count of historicalNodes) {
      const column = count.cost?.currency;
      if (column) {
        counts.set(column, (counts.get(column) ?? 0) + 1);
      }
    }
    let best: string | null = null;
    let bestN = 0;
    for (const [column, count] of counts) {
      if (count > bestN) {
        best = column;
        bestN = count;
      }
    }
    return best ?? currency;
  }, [historicalNodes, currency]);

  const topCosts = useMemo(
    () => topDwellCosts(filteredNodes, waccRate, storageCost, 5),
    [filteredNodes, waccRate, storageCost],
  );

  const monthlyCarryCost = useMemo(
    () => aggregateMonthlyCarryCost(filteredNodes, waccRate, storageCost),
    [filteredNodes, waccRate, storageCost],
  );

  // Rows are returned unsorted: each detail table owns its own sort + filter.
  const dwellRows = useMemo(() => {
    return filteredNodes
      .filter((count) => DWELL_TYPES.includes(count.type) && count.stats.n > 0)
      .map((count) => {
        const historical =
          historicalNodesByKey.get(siteNodeKey(count)) ?? count;
        const costTrend = computeCostTrend(
          historical,
          timeRange,
          waccRate,
          storageCost,
        );
        const timingTrend = computeTimingTrend(historical, timeRange, measure);
        return {
          ...count,
          periodCost: computeNodePeriodCost(count, waccRate, storageCost),
          costTrendPct: costTrend.pctChange,
          previousPeriodCost: costTrend.previousTotal,
          previousCostN: costTrend.previousN,
          trendPct: timingTrend.pctChange,
          previousValue: timingTrend.previousValue,
          previousTrendN: timingTrend.previousN,
        };
      });
  }, [
    filteredNodes,
    historicalNodesByKey,
    waccRate,
    storageCost,
    timeRange,
    measure,
  ]);

  const planningRows = useMemo(() => {
    return planningVisibleNodes
      .filter(
        (count) => count.plan != null && count.plan > 0 && count.stats.n > 0,
      )
      .map((count) => {
        const plan = count.plan as number;
        const historical =
          historicalNodesByKey.get(siteNodeKey(count)) ?? count;
        const trend = computeTimingTrend(historical, timeRange, measure);
        return {
          ...count,
          deviationPct:
            (((selectStat(count.stats, measure) ?? 0) - plan) / plan) * 100,
          trendPct: trend.pctChange,
          previousValue: trend.previousValue,
          previousTrendN: trend.previousN,
        };
      });
  }, [planningVisibleNodes, historicalNodesByKey, timeRange, measure]);

  const windowedSupplier = useMemo(() => {
    if (!supplierData) {
      return null;
    }
    return recomputeSitePerformance(supplierData, timeRange);
  }, [supplierData, timeRange]);

  const supplierRows = useMemo(() => {
    if (!windowedSupplier) {
      return [] as VendorOtifStats[];
    }
    const min = supplierLeaderboardMin(windowedSupplier.overall);
    return windowedSupplier.vendors.filter((value) => value.n_lines >= min);
  }, [windowedSupplier]);

  const supplierTop = useMemo(() => {
    if (supplierRows.length === 0) {
      return [] as VendorOtifStats[];
    }
    const sorted = [...supplierRows].sort((left, right) => {
      const av = left.otif_pct ?? 0;
      const bv = right.otif_pct ?? 0;
      if (av === bv) {
        return right.n_lines - left.n_lines;
      }
      return supplierMode === "worst" ? av - bv : bv - av;
    });
    return sorted.slice(0, 5);
  }, [supplierRows, supplierMode]);

  const trendRows = useMemo(() => {
    return planningVisibleNodes
      .filter((count) => count.stats.n > 0)
      .map((count) => {
        const historical =
          historicalNodesByKey.get(siteNodeKey(count)) ?? count;
        const trend = computeTimingTrend(historical, timeRange, measure);
        return {
          ...count,
          trendPct: trend.pctChange,
          previousValue: trend.previousValue,
          previousTrendN: trend.previousN,
        };
      })
      .filter(
        (count) => !excludeLowSamples || hasEnoughSample(count.previousTrendN),
      );
  }, [
    planningVisibleNodes,
    historicalNodesByKey,
    timeRange,
    excludeLowSamples,
    measure,
  ]);

  return {
    loading,
    error,
    filteredNodes,
    summaryStats,
    siteCurrency,
    topCosts,
    monthlyCarryCost,
    dwellRows,
    planningRows,
    supplierRows,
    supplierTop,
    trendRows,
    windowedSupplier,
    supplierData,
  };
}
