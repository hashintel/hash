import type { ProcurementBasis } from "./procurement-basis-context";
import type {
  Observation,
  PlanningNotice,
  ProcurementNodeObservation,
  ProcurementPlanMatchStatus,
} from "./types";

type DetailRow = Record<string, unknown>;

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isPlanningNotice(value: unknown): value is PlanningNotice {
  if (!value || typeof value !== "object") {
    return false;
  }
  const notice = value as Record<string, unknown>;
  return (
    (notice.level === "info" || notice.level === "warning") &&
    typeof notice.text === "string"
  );
}

function isPlanMatchStatus(
  value: unknown,
): value is ProcurementPlanMatchStatus {
  return (
    value === "matched" ||
    value === "missing_profile" ||
    value === "missing_supplier" ||
    value === "mixed_basis" ||
    value === "ambiguous"
  );
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((entry): entry is string => typeof entry === "string")
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

function planningNoticeFromRow(row: DetailRow): PlanningNotice | null {
  if (isPlanningNotice(row.planning_notice)) {
    return row.planning_notice;
  }
  const text = row.planning_notice_text;
  const level = row.planning_notice_level;
  return typeof text === "string" &&
    (level === "info" || level === "warning")
    ? { level, text }
    : null;
}

function daysBetween(start: string, end: string): number | null {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return null;
  }
  return Math.round((endMs - startMs) / 86_400_000);
}

export function isProcurementNodeObservation(
  value: unknown,
): value is ProcurementNodeObservation {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    isIsoDate(row.first_receipt_date) &&
    typeof row.first_receipt_value === "number" &&
    isIsoDate(row.last_receipt_date) &&
    typeof row.last_receipt_value === "number"
  );
}

export function procurementNodeObservationsForBasis(
  observations: ProcurementNodeObservation[],
  basis: ProcurementBasis,
): Observation[] {
  const isComplete = basis === "complete";
  return observations.map((observation) => {
    const value = isComplete
      ? observation.last_receipt_value
      : observation.first_receipt_value;
    return {
      date: isComplete
        ? observation.last_receipt_date
        : observation.first_receipt_date,
      value,
      po_number: observation.po_number,
      supplier_id: observation.supplier_id,
      supplier_name: observation.supplier_name,
      receipt_basis: observation.receipt_basis,
      planning_profile_id: observation.planning_profile_id,
      plan_days: observation.plan_days,
      plan_provenance: observation.plan_provenance,
      plan_match_status: observation.plan_match_status,
      planning_notice: observation.planning_notice,
      dock_to_stock_days: observation.dock_to_stock_days,
      candidate_ids: observation.candidate_ids,
      variance_days:
        (isComplete
          ? observation.complete_variance_days
          : observation.first_variance_days) ??
        (observation.plan_days != null
          ? value - observation.plan_days
          : null),
    };
  });
}

export function deriveProcurementTimingFromRows(rows: DetailRow[]): {
  first: Observation[];
  complete: Observation[];
} | null {
  const byPo = new Map<string, DetailRow[]>();
  for (const row of rows) {
    const po = row.po_number;
    if (typeof po !== "string" && typeof po !== "number") {
      continue;
    }
    const key = String(po);
    const group = byPo.get(key);
    if (group) {
      group.push(row);
    } else {
      byPo.set(key, [row]);
    }
  }

  const first: Observation[] = [];
  const complete: Observation[] = [];

  for (const [poNumber, group] of byPo) {
    const poDate = group.map((row) => row.po_date).find(isIsoDate);
    if (!poDate) {
      continue;
    }

    const firstDates = group
      .map((row) => row.first_gr_date)
      .filter(isIsoDate)
      .sort();
    const lastDates = group
      .map((row) => row.last_gr_date)
      .filter(isIsoDate)
      .sort();
    const firstDate = firstDates[0];
    const lastDate = lastDates[lastDates.length - 1];
    if (!firstDate || !lastDate) {
      continue;
    }

    const firstValue = daysBetween(poDate, firstDate);
    const lastValue = daysBetween(poDate, lastDate);
    if (
      firstValue == null ||
      lastValue == null ||
      firstValue < 0 ||
      lastValue < 0
    ) {
      continue;
    }

    const profileRow = group[0] ?? {};
    const planDays =
      typeof profileRow.plan_days === "number" ? profileRow.plan_days : null;
    const hasProfileMetadata =
      planDays != null ||
      profileRow.planning_profile_id != null ||
      profileRow.receipt_basis != null ||
      profileRow.vendor_id != null ||
      profileRow.vendor_name != null;
    if (!hasProfileMetadata) {
      first.push({ date: firstDate, value: firstValue });
      complete.push({ date: lastDate, value: lastValue });
      continue;
    }
    const metadata = {
      po_number: poNumber,
      supplier_id:
        typeof profileRow.supplier_id === "string" ||
        typeof profileRow.supplier_id === "number"
          ? String(profileRow.supplier_id)
          : typeof profileRow.vendor_id === "string" ||
              typeof profileRow.vendor_id === "number"
            ? String(profileRow.vendor_id)
          : null,
      supplier_name:
        typeof profileRow.supplier_name === "string"
          ? profileRow.supplier_name
          : typeof profileRow.vendor_name === "string"
          ? profileRow.vendor_name
          : null,
      receipt_basis:
        profileRow.receipt_basis === "ordinary" ||
        profileRow.receipt_basis === "consignment" ||
        profileRow.receipt_basis === "subcontract" ||
        profileRow.receipt_basis === "mixed" ||
        profileRow.receipt_basis === "unknown"
          ? profileRow.receipt_basis
          : null,
      planning_profile_id:
        typeof profileRow.planning_profile_id === "string"
          ? profileRow.planning_profile_id
          : null,
      plan_days: planDays,
      plan_provenance:
        profileRow.plan_provenance === "profile" ||
        profileRow.plan_provenance === "fallback"
          ? profileRow.plan_provenance
          : null,
      plan_match_status: isPlanMatchStatus(profileRow.plan_match_status)
        ? profileRow.plan_match_status
        : null,
      planning_notice: planningNoticeFromRow(profileRow),
      dock_to_stock_days:
        typeof profileRow.dock_to_stock_days === "number"
          ? profileRow.dock_to_stock_days
          : null,
      candidate_ids: stringArray(
        profileRow.candidate_ids ?? profileRow.candidate_ids_json,
      ),
    } as const;
    first.push({
      date: firstDate,
      value: firstValue,
      ...metadata,
      variance_days: planDays == null ? null : firstValue - planDays,
    });
    complete.push({
      date: lastDate,
      value: lastValue,
      ...metadata,
      variance_days: planDays == null ? null : lastValue - planDays,
    });
  }

  if (first.length === 0 || complete.length === 0) {
    return null;
  }
  first.sort((left, right) =>
    left.date < right.date ? -1 : left.date > right.date ? 1 : 0,
  );
  complete.sort((left, right) =>
    left.date < right.date ? -1 : left.date > right.date ? 1 : 0,
  );
  return { first, complete };
}
