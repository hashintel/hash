import { DWELL_TYPES } from "../../../shared/categories";
import { formatMonth } from "../../../shared/chart-format";
import { computeMonthlyCost, formatNumber } from "../../../shared/cost";
import { type BaseMeasure, selectStat } from "../../../shared/measure-context";
import {
  LOW_SAMPLE_N,
  type DwellRow,
  type PlanningRow,
  type SortKey,
  type SortDir,
  type TrendRow,
} from "./row-types";

import type {
  SiteNode,
  StepType,
  VendorOtifStats,
} from "../../../shared/types";

// ── Sample / formatting helpers ────────────────────────────────────────────

export function hasEnoughSample(count: number): boolean {
  return count >= LOW_SAMPLE_N;
}

export function colorForOtif(otif: number | null): string {
  if (otif == null) {
    return "#646464";
  }
  if (otif >= 95) {
    return "#2b9a66";
  }
  if (otif >= 80) {
    return "#c27803";
  }
  return "#ce2c31";
}

export function lowSampleBadges(
  currentN: number,
  previousN?: number | null,
): Array<{ label: string; title: string }> {
  const badges: Array<{ label: string; title: string }> = [];
  if (currentN > 0 && currentN < LOW_SAMPLE_N) {
    badges.push({
      label: "low sample",
      title: `Current period has ${currentN} observations`,
    });
  }
  if (previousN != null && previousN > 0 && previousN < LOW_SAMPLE_N) {
    badges.push({
      label: "low sample prev",
      title: `Previous comparison period has ${previousN} observations`,
    });
  }
  return badges;
}

// Finished-good-specific steps whose base label is identical across products
// and would make the table row ambiguous without the finished-good name appended.
const PRODUCT_TITLED_TYPES: StepType[] = ["post_qa_ship", "qa_hold"];

export function siteNodeDisplayLabel(node: SiteNode): string {
  if (PRODUCT_TITLED_TYPES.includes(node.type) && node.products.length === 1) {
    const name = node.products[0]?.name;
    if (name) {
      return `${node.label}: ${name}`;
    }
  }
  return node.label;
}

export function subtitleForVendor(value: VendorOtifStats): string {
  const parts: string[] = [`${value.n_lines} lines`];
  if (value.n_late > 0 && value.mean_days_late_when_late != null) {
    parts.push(
      `mean delay | late: ${formatNumber(value.mean_days_late_when_late, {
        maximumFractionDigits: 1,
      })}d`,
    );
  } else if (value.n_late === 0) {
    parts.push("0 late");
  }
  return parts.join(" · ");
}

// ── Table sorting ──────────────────────────────────────────────────────────

export function sortRows(
  rows: DwellRow[],
  sort: { key: SortKey; dir: SortDir },
  measure: BaseMeasure = "median",
): DwellRow[] {
  return [...rows].sort((left, right) => {
    let va = 0;
    let vb = 0;
    if (sort.key === "median") {
      va = selectStat(left.stats, measure) ?? 0;
      vb = selectStat(right.stats, measure) ?? 0;
    } else if (sort.key === "cost") {
      va = left.periodCost;
      vb = right.periodCost;
    } else if (sort.key === "sample") {
      va = left.stats.n;
      vb = right.stats.n;
    } else if (sort.key === "costTrend") {
      va =
        left.costTrendPct ??
        (sort.dir === "desc"
          ? Number.NEGATIVE_INFINITY
          : Number.POSITIVE_INFINITY);
      vb =
        right.costTrendPct ??
        (sort.dir === "desc"
          ? Number.NEGATIVE_INFINITY
          : Number.POSITIVE_INFINITY);
    } else if (sort.key === "material") {
      return sort.dir === "desc"
        ? right.label.localeCompare(left.label)
        : left.label.localeCompare(right.label);
    }
    return sort.dir === "desc" ? vb - va : va - vb;
  });
}

export function sortPlanningRows(
  rows: PlanningRow[],
  sort: { key: SortKey; dir: SortDir },
  measure: BaseMeasure = "median",
): PlanningRow[] {
  return [...rows].sort((left, right) => {
    let va = 0;
    let vb = 0;
    if (sort.key === "deviation") {
      va = left.deviationPct;
      vb = right.deviationPct;
    } else if (sort.key === "exceeding") {
      va = left.pct_exceeding_plan ?? 0;
      vb = right.pct_exceeding_plan ?? 0;
    } else if (sort.key === "planned") {
      va =
        left.plan ??
        (sort.dir === "desc"
          ? Number.NEGATIVE_INFINITY
          : Number.POSITIVE_INFINITY);
      vb =
        right.plan ??
        (sort.dir === "desc"
          ? Number.NEGATIVE_INFINITY
          : Number.POSITIVE_INFINITY);
    } else if (sort.key === "median") {
      va = selectStat(left.stats, measure) ?? 0;
      vb = selectStat(right.stats, measure) ?? 0;
    } else if (sort.key === "sample") {
      va = left.stats.n;
      vb = right.stats.n;
    } else if (sort.key === "trend") {
      va =
        left.trendPct ??
        (sort.dir === "desc"
          ? Number.NEGATIVE_INFINITY
          : Number.POSITIVE_INFINITY);
      vb =
        right.trendPct ??
        (sort.dir === "desc"
          ? Number.NEGATIVE_INFINITY
          : Number.POSITIVE_INFINITY);
    } else if (sort.key === "material") {
      return sort.dir === "desc"
        ? right.label.localeCompare(left.label)
        : left.label.localeCompare(right.label);
    }
    return sort.dir === "desc" ? vb - va : va - vb;
  });
}

export function sortTrendRows(
  rows: TrendRow[],
  sort: { key: SortKey; dir: SortDir },
  measure: BaseMeasure = "median",
): TrendRow[] {
  return [...rows].sort((left, right) => {
    let va = 0;
    let vb = 0;
    if (sort.key === "median") {
      va = selectStat(left.stats, measure) ?? 0;
      vb = selectStat(right.stats, measure) ?? 0;
    } else if (sort.key === "sample") {
      va = left.stats.n;
      vb = right.stats.n;
    } else if (sort.key === "previous") {
      va =
        left.previousValue ??
        (sort.dir === "desc"
          ? Number.NEGATIVE_INFINITY
          : Number.POSITIVE_INFINITY);
      vb =
        right.previousValue ??
        (sort.dir === "desc"
          ? Number.NEGATIVE_INFINITY
          : Number.POSITIVE_INFINITY);
    } else if (sort.key === "trend") {
      va =
        left.trendPct ??
        (sort.dir === "desc"
          ? Number.NEGATIVE_INFINITY
          : Number.POSITIVE_INFINITY);
      vb =
        right.trendPct ??
        (sort.dir === "desc"
          ? Number.NEGATIVE_INFINITY
          : Number.POSITIVE_INFINITY);
    } else if (sort.key === "material") {
      return sort.dir === "desc"
        ? right.label.localeCompare(left.label)
        : left.label.localeCompare(right.label);
    }
    return sort.dir === "desc" ? vb - va : va - vb;
  });
}

export function sortSupplierRows(
  rows: VendorOtifStats[],
  sort: { key: SortKey; dir: SortDir },
): VendorOtifStats[] {
  return [...rows].sort((left, right) => {
    if (sort.key === "vendor") {
      return sort.dir === "desc"
        ? (right.vendor_name ?? "").localeCompare(left.vendor_name ?? "")
        : (left.vendor_name ?? "").localeCompare(right.vendor_name ?? "");
    }
    const pick = (value: VendorOtifStats): number => {
      switch (sort.key) {
        case "lines":
          return value.n_lines;
        case "onTime":
          return value.on_time_pct ?? 0;
        case "otif":
          return value.otif_pct ?? 0;
        case "meanLate":
          return value.mean_days_late_all ?? 0;
        case "meanLateWhenLate":
          return value.mean_days_late_when_late ?? 0;
        case "maxLate":
          return value.max_days_late;
        default:
          return 0;
      }
    };
    const av = pick(left);
    const bv = pick(right);
    return sort.dir === "desc" ? bv - av : av - bv;
  });
}

// ── Monthly carry-cost aggregation ─────────────────────────────────────────

export interface SiteMonthlyCostPoint {
  month: string;
  monthLabel: string;
  totalCost: number;
  nBatches: number;
}

export function aggregateMonthlyCarryCost(
  nodes: SiteNode[],
  waccRate: number,
  storageCost: number,
): SiteMonthlyCostPoint[] {
  const byMonth = new Map<string, { totalCost: number; nBatches: number }>();
  for (const node of nodes) {
    if (!DWELL_TYPES.includes(node.type) || !node.cost || !node.monthly) {
      continue;
    }
    for (const month of node.monthly) {
      const cost =
        computeMonthlyCost(
          month.total_kg_days,
          node.cost.unit_price,
          waccRate,
          storageCost,
        ) ?? 0;
      const entry = byMonth.get(month.month) ?? { totalCost: 0, nBatches: 0 };
      entry.totalCost += cost;
      entry.nBatches += month.n;
      byMonth.set(month.month, entry);
    }
  }
  return Array.from(byMonth.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, value]) => ({
      month,
      monthLabel: formatMonth(month),
      ...value,
    }));
}
