/**
 * Client-side supplier OTIF aggregation. The wire carries raw `lines[]` plus
 * tolerance settings; this module materialises all vendor monthly trends, worst
 * events, material breakdowns and on-time/in-full percentages.
 *
 * The single source of truth for tolerances is the backend payload itself
 * (`overall.tolerance_days` / `overall.under_tolerance_pct` on the site file;
 * the same pair is mirrored on procurement step blocks).
 */

import { cutoffForRange, type TimeRange } from "./time-range";

import type {
  ProcurementSupplierBlock,
  SiteSupplierPerformance,
  SupplierLine,
  SupplierWorstEvent,
  VendorOtifStats,
} from "./types";

const LATE_THRESHOLDS = [1, 3, 7, 14] as const;
type LateBucketKey = `ge_${(typeof LATE_THRESHOLDS)[number]}d_pct`;
const WORST_N_PER_VENDOR = 5;
const DEFAULT_TOLERANCE_DAYS = 0;
const DEFAULT_UNDER_TOLERANCE_PCT = 0.05;

interface Tolerances {
  toleranceDays: number;
  underTolerancePct: number;
}

const lateBucketKey = (
  threshold: (typeof LATE_THRESHOLDS)[number],
): LateBucketKey => `ge_${threshold}d_pct`;

const defaultTolerances: Tolerances = {
  toleranceDays: DEFAULT_TOLERANCE_DAYS,
  underTolerancePct: DEFAULT_UNDER_TOLERANCE_PCT,
};

function round1(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  return Math.round(value * 10) / 10;
}

function isOnTime(line: SupplierLine, tol: Tolerances): boolean {
  return line.days_late <= tol.toleranceDays;
}

function isInFull(line: SupplierLine, tol: Tolerances): boolean {
  const sched = line.sched_qty ?? 0;
  const got = line.gr_qty_to_date ?? 0;
  if (sched <= 0) {
    return true;
  }
  return got >= sched * (1 - tol.underTolerancePct);
}

/** Subset `lines` to those whose `first_gr_date` month is >= the range cutoff.
 *  Lines without a GR date are excluded from any windowed view (they can't be
 *  placed in time). */
export function filterLinesByRange(
  lines: readonly SupplierLine[],
  range: TimeRange,
): SupplierLine[] {
  const cutoff = cutoffForRange(range);
  return lines.filter((line) => {
    if (!line.first_gr_date) {
      return false;
    }
    return line.first_gr_date.slice(0, 7) >= cutoff;
  });
}

function meanOrNull(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total / values.length;
}

function medianOrNull(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid];
  if (upper === undefined) {
    throw new Error("Median index was outside the provided supplier series");
  }
  if (sorted.length % 2 === 0) {
    const lower = sorted[mid - 1];
    if (lower === undefined) {
      throw new Error(
        "Median lower index was outside the provided supplier series",
      );
    }
    return (lower + upper) / 2;
  }
  return upper;
}

/** Per-vendor OTIF record from a homogeneous (same vendor) line subset. */
export function aggregateVendorStats(
  lines: readonly SupplierLine[],
  vendorId: string | null,
  vendorName: string | null,
  tol: Tolerances = defaultTolerances,
): VendorOtifStats {
  const days = lines.map((line) => line.days_late);
  const late = days.filter((day) => day > tol.toleranceDays);
  const onTime = lines.filter((line) => isOnTime(line, tol));
  const inFull = lines.filter((line) => isInFull(line, tol));
  const otif = lines.filter(
    (line) => isOnTime(line, tol) && isInFull(line, tol),
  );

  let schedSum = 0;
  let gotSum = 0;
  for (const line of lines) {
    schedSum += line.sched_qty ?? 0;
    gotSum += line.gr_qty_to_date ?? 0;
  }
  const fillRate = schedSum > 0 ? round1((100 * gotSum) / schedSum) : null;

  const lateBuckets: Record<LateBucketKey, number | null> = {
    ge_1d_pct: null as number | null,
    ge_3d_pct: null as number | null,
    ge_7d_pct: null as number | null,
    ge_14d_pct: null as number | null,
  };
  if (lines.length > 0) {
    for (const thr of LATE_THRESHOLDS) {
      const share =
        (days.filter((day) => day >= thr).length / lines.length) * 100;
      const key = lateBucketKey(thr);
      lateBuckets[key] = round1(share);
    }
  }

  return {
    vendor_id: vendorId,
    vendor_name: vendorName,
    n_lines: lines.length,
    n_late: late.length,
    on_time_pct:
      lines.length > 0 ? round1((onTime.length / lines.length) * 100) : null,
    in_full_pct:
      lines.length > 0 ? round1((inFull.length / lines.length) * 100) : null,
    otif_pct:
      lines.length > 0 ? round1((otif.length / lines.length) * 100) : null,
    mean_days_late_all: round1(meanOrNull(days)),
    mean_days_late_when_late: late.length > 0 ? round1(meanOrNull(late)) : null,
    median_days_late_when_late:
      late.length > 0 ? round1(medianOrNull(late)) : null,
    max_days_late: late.length > 0 ? Math.max(...late) : 0,
    fill_rate_pct: fillRate,
    late_buckets: lateBuckets,
  };
}

/** Monthly on-time % buckets (one row per YYYY-MM, sorted ascending). */
export function monthlyOnTime(
  lines: readonly SupplierLine[],
  tol: Tolerances = defaultTolerances,
): Array<{ month: string; n: number; on_time_pct: number | null }> {
  const buckets = new Map<string, { n: number; onTime: number }>();
  for (const line of lines) {
    if (!line.first_gr_date) {
      continue;
    }
    const month = line.first_gr_date.slice(0, 7);
    const bucket = buckets.get(month) ?? { n: 0, onTime: 0 };
    bucket.n += 1;
    if (isOnTime(line, tol)) {
      bucket.onTime += 1;
    }
    buckets.set(month, bucket);
  }
  return Array.from(buckets.entries())
    .map(([month, { n: count, onTime }]) => ({
      month,
      n: count,
      on_time_pct: count > 0 ? round1((onTime / count) * 100) : null,
    }))
    .sort((left, right) => left.month.localeCompare(right.month));
}

/** Materialise a `SupplierWorstEvent` from a late line. */
function lineToWorstEvent(line: SupplierLine): SupplierWorstEvent {
  return {
    vendor_id: line.vendor_id,
    vendor_name: line.vendor_name,
    matnr: line.matnr,
    material_name: line.material_name,
    po_number: line.po_number,
    po_item: line.po_item,
    po_date: line.po_date,
    promised_date: line.promised_date,
    first_gr_date: line.first_gr_date,
    days_late: line.days_late,
    sched_qty: line.sched_qty,
    gr_qty_to_date: line.gr_qty_to_date,
  };
}

/** Top-N late events from the given pool, sorted worst-first. */
export function worstEventsFromLines(
  lines: readonly SupplierLine[],
  count: number,
  tol: Tolerances = defaultTolerances,
): SupplierWorstEvent[] {
  const late = lines.filter((line) => line.days_late > tol.toleranceDays);
  late.sort((left, right) => right.days_late - left.days_late);
  return late.slice(0, count).map(lineToWorstEvent);
}

function tolerancesFromBlock(block: {
  tolerance_days?: number;
  under_tolerance_pct?: number;
}): Tolerances {
  return {
    toleranceDays: block.tolerance_days ?? DEFAULT_TOLERANCE_DAYS,
    underTolerancePct: block.under_tolerance_pct ?? DEFAULT_UNDER_TOLERANCE_PCT,
  };
}

function groupLines(
  lines: readonly SupplierLine[],
): Map<string, SupplierLine[]> {
  const vendorMap = new Map<string, SupplierLine[]>();
  for (const line of lines) {
    const key = `${line.vendor_id ?? ""}__${line.vendor_name ?? ""}`;
    const bucket = vendorMap.get(key) ?? [];
    bucket.push(line);
    vendorMap.set(key, bucket);
  }
  return vendorMap;
}

function materialBreakdown(
  lines: readonly SupplierLine[],
  tol: Tolerances,
): NonNullable<VendorOtifStats["materials"]> {
  const matMap = new Map<string, SupplierLine[]>();
  for (const line of lines) {
    const key = `${line.matnr ?? ""}__${line.material_name ?? ""}`;
    const bucket = matMap.get(key) ?? [];
    bucket.push(line);
    matMap.set(key, bucket);
  }

  const materials: NonNullable<VendorOtifStats["materials"]> = [];
  for (const [, mlines] of matMap) {
    const first = mlines[0];
    if (!first) {
      continue;
    }
    const onTime = mlines.filter((line) => isOnTime(line, tol)).length;
    const otif = mlines.filter(
      (line) => isOnTime(line, tol) && isInFull(line, tol),
    ).length;
    materials.push({
      matnr: first.matnr ?? "",
      name: first.material_name ?? first.matnr ?? "",
      n_lines: mlines.length,
      on_time_pct:
        mlines.length > 0 ? round1((onTime / mlines.length) * 100) : null,
      otif_pct: mlines.length > 0 ? round1((otif / mlines.length) * 100) : null,
    });
  }
  materials.sort((left, right) => right.n_lines - left.n_lines);
  return materials;
}

/** Materialise the per-step `supplier_otif` block for `range`.
 *
 *  Preserves `primary_vendor`, `coverage_pct`, `data_quality_note` and the
 *  tolerance settings; recomputes `vendors`, `worst_events`, `n_lines`,
 *  per-vendor `monthly`, and per-vendor `materials` from the line subset. If the block
 *  has no `lines[]` array, returns it untouched. */
export function recomputeSupplierBlock(
  block: ProcurementSupplierBlock,
  range?: TimeRange,
): ProcurementSupplierBlock {
  if (!block.lines) {
    return block;
  }
  const tol = tolerancesFromBlock(block);
  const filtered = range
    ? filterLinesByRange(block.lines, range)
    : [...block.lines];
  const vendorMap = groupLines(filtered);

  const vendors: VendorOtifStats[] = [];
  for (const [, group] of vendorMap) {
    const first = group[0];
    if (!first) {
      continue;
    }
    const rec = aggregateVendorStats(
      group,
      first.vendor_id,
      first.vendor_name,
      tol,
    );
    rec.monthly = monthlyOnTime(group, tol);
    rec.worst_events = worstEventsFromLines(group, WORST_N_PER_VENDOR, tol);
    rec.materials = materialBreakdown(group, tol);
    vendors.push(rec);
  }
  vendors.sort((left, right) => {
    const aOtif = left.otif_pct ?? -1;
    const bOtif = right.otif_pct ?? -1;
    if (bOtif !== aOtif) {
      return bOtif - aOtif;
    }
    return right.n_lines - left.n_lines;
  });

  return {
    ...block,
    vendors,
    worst_events: worstEventsFromLines(filtered, WORST_N_PER_VENDOR * 2, tol),
    n_lines: filtered.length,
    lines: filtered,
  };
}

/** Materialise `_global/supplier_performance.json` for `range`. */
export function recomputeSitePerformance(
  perf: SiteSupplierPerformance,
  range?: TimeRange,
): SiteSupplierPerformance {
  if (!perf.lines) {
    return perf;
  }
  const tol: Tolerances = {
    toleranceDays: perf.overall.tolerance_days,
    underTolerancePct: perf.overall.under_tolerance_pct,
  };
  const filtered = range
    ? filterLinesByRange(perf.lines, range)
    : [...perf.lines];
  const vendorMap = groupLines(filtered);

  const vendors: VendorOtifStats[] = [];
  for (const [, group] of vendorMap) {
    const first = group[0];
    if (!first) {
      continue;
    }
    const rec = aggregateVendorStats(
      group,
      first.vendor_id,
      first.vendor_name,
      tol,
    );
    rec.monthly = monthlyOnTime(group, tol);
    rec.worst_events = worstEventsFromLines(group, WORST_N_PER_VENDOR, tol);
    rec.materials = materialBreakdown(group, tol);

    vendors.push(rec);
  }
  vendors.sort((left, right) => right.n_lines - left.n_lines);

  const nLines = filtered.length;
  const onTimeCount = filtered.filter((line) => isOnTime(line, tol)).length;
  const inFullCount = filtered.filter((line) => isInFull(line, tol)).length;
  const otifCount = filtered.filter(
    (line) => isOnTime(line, tol) && isInFull(line, tol),
  ).length;
  const vendorIds = new Set<string>();
  for (const line of filtered) {
    if (line.vendor_id) {
      vendorIds.add(line.vendor_id);
    }
  }

  return {
    ...perf,
    overall: {
      ...perf.overall,
      n_lines: nLines,
      n_vendors: vendorIds.size,
      on_time_pct: nLines > 0 ? round1((onTimeCount / nLines) * 100) : null,
      in_full_pct: nLines > 0 ? round1((inFullCount / nLines) * 100) : null,
      otif_pct: nLines > 0 ? round1((otifCount / nLines) * 100) : null,
    },
    vendors,
    lines: filtered,
  };
}
