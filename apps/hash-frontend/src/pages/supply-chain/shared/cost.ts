import { createContext, useContext } from "react";

export const DEFAULT_WACC = 0.1;
export const DEFAULT_STORAGE_COST = 0.4; // currency units/tonne/day
export const DEFAULT_CURRENCY = "USD";

interface CostParamsCtx {
  currency: string;
  setAnalysisSettings: (
    settings:
      | { currency?: string | null; storage_cost?: number | null }
      | null
      | undefined,
  ) => void;
  waccRate: number;
  setWaccRate: (rate: number) => void;
  storageCost: number;
  setStorageCost: (cost: number) => void;
}

export const CostParamsContext = createContext<CostParamsCtx>({
  currency: DEFAULT_CURRENCY,
  setAnalysisSettings: () => {},
  waccRate: DEFAULT_WACC,
  setWaccRate: () => {},
  storageCost: DEFAULT_STORAGE_COST,
  setStorageCost: () => {},
});

export function useCostParams() {
  return useContext(CostParamsContext);
}

interface OutlierCtx {
  excludeOutliers: boolean;
  setExcludeOutliers: (exclude: boolean) => void;
}

export const OutlierContext = createContext<OutlierCtx>({
  excludeOutliers: true,
  setExcludeOutliers: () => {},
});

export function useOutlierSetting() {
  return useContext(OutlierContext);
}

/** Cost rate per kg per day given current WACC and storage params. */
export function costRatePerKgDay(
  unitPrice: number | null | undefined,
  waccRate: number,
  storageCost: number,
): number {
  return (unitPrice ?? 0) * (waccRate / 365) + storageCost / 1000;
}

/** Recompute monthly total cost from kg-days and unit price. */
export function computeMonthlyCost(
  totalKgDays: number | null | undefined,
  unitPrice: number | null | undefined,
  waccRate: number,
  storageCost: number,
): number | null {
  if (totalKgDays == null || unitPrice == null) {
    return null;
  }
  return totalKgDays * costRatePerKgDay(unitPrice, waccRate, storageCost);
}

/** A monthly bucket carrying the kg-days needed to recompute carrying cost. */
interface KgDayBucket {
  total_kg_days?: number | null;
}

/**
 * Sum a node's carrying cost over its monthly buckets: the period total is
 * `Σ computeMonthlyCost(bucket.total_kg_days, unitPrice, wacc, storage)`.
 * Single source of truth for the ~10 inline reduce copies across the app.
 */
export function computePeriodCost(
  monthly: KgDayBucket[] | null | undefined,
  unitPrice: number | null | undefined,
  waccRate: number,
  storageCost: number,
): number {
  if (!monthly) {
    return 0;
  }
  return monthly.reduce(
    (sum, month) =>
      sum +
      (computeMonthlyCost(
        month.total_kg_days,
        unitPrice,
        waccRate,
        storageCost,
      ) ?? 0),
    0,
  );
}

/** Recompute daily carrying cost from mean quantity and unit price. */
export function computeDailyCost(
  meanQty: number | null | undefined,
  unitPrice: number | null | undefined,
  waccRate: number,
  storageCost: number,
): number | null {
  if (meanQty == null || unitPrice == null) {
    return null;
  }
  return meanQty * costRatePerKgDay(unitPrice, waccRate, storageCost);
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  JPY: "¥",
  USD: "$",
  EUR: "€",
  CNY: "¥",
  CHF: "CHF",
};

/** Resolve the active locale for all number/date formatting. Single source of truth. */
export function getUserLocale(): string {
  return navigator.language;
}

function localiseNumber(
  value: number,
  opts?: { maximumFractionDigits?: number; minimumFractionDigits?: number },
): string {
  return new Intl.NumberFormat(getUserLocale(), opts).format(value);
}

export function formatCost(
  value: number | null | undefined,
  currency: string | null,
  opts?: { compact?: boolean },
): string {
  if (value == null) {
    return "–";
  }
  const activeCurrency = currency ?? DEFAULT_CURRENCY;
  const sym = CURRENCY_SYMBOLS[activeCurrency] ?? "";
  if (opts?.compact) {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) {
      return `${sym}${localiseNumber(value / 1_000_000, { maximumFractionDigits: 1 })}m`;
    }
    if (abs >= 1_000) {
      return `${sym}${localiseNumber(value / 1_000, { maximumFractionDigits: 1 })}k`;
    }
    return `${sym}${localiseNumber(Math.round(value))}`;
  }
  if (activeCurrency === "JPY" || activeCurrency === "CNY") {
    return `${sym}${localiseNumber(Math.round(value))}`;
  }
  return `${sym}${localiseNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Format a plain number (non-currency) respecting user locale. */
export function formatNumber(
  value: number | null | undefined,
  opts?: {
    maximumFractionDigits?: number;
    minimumFractionDigits?: number;
    compact?: boolean;
  },
): string {
  if (value == null) {
    return "–";
  }
  if (opts?.compact) {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) {
      return `${localiseNumber(value / 1_000_000, { maximumFractionDigits: 1 })}m`;
    }
    if (abs >= 1_000) {
      return `${localiseNumber(value / 1_000, { maximumFractionDigits: 1 })}k`;
    }
  }
  return localiseNumber(value, opts);
}
