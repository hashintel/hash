import type { ProcurementBasis } from "./procurement-basis-context";
import type {
  Observation,
  PlanningWarning,
  ProcurementNodeObservation,
  ProcurementPlanMatchStatus,
  ProcurementPlanningAlternative,
  ProcurementPlanningSource,
} from "./types";

type DetailRow = Record<string, unknown>;

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isPlanMatchStatus(
  value: unknown,
): value is ProcurementPlanMatchStatus {
  return (
    value === "matched" ||
    value === "matched_wrong_basis" ||
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

function parsedJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function planningSourceFromRow(
  row: DetailRow,
): ProcurementPlanningSource | null {
  const value = parsedJson(row.planning_source ?? row.planning_source_json);
  if (
    !isRecord(value) ||
    typeof value.label !== "string" ||
    typeof value.system !== "string" ||
    typeof value.table !== "string" ||
    !isNullableString(value.source_id) ||
    typeof value.material !== "string" ||
    typeof value.site !== "string" ||
    !isNullableString(value.supplier_id) ||
    !isNullableString(value.basis) ||
    !isNullableNumber(value.plan_days) ||
    !isNullableNumber(value.dock_to_stock_days) ||
    typeof value.match_level !== "string"
  ) {
    return null;
  }
  return value as unknown as ProcurementPlanningSource;
}

function planningAlternativesFromRow(
  row: DetailRow,
): ProcurementPlanningAlternative[] {
  const value = parsedJson(
    row.planning_alternatives ?? row.planning_alternatives_json,
  );
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is ProcurementPlanningAlternative =>
      isRecord(entry) &&
      typeof entry.label === "string" &&
      isNullableNumber(entry.plan_days),
  );
}

function planningWarningsFromRow(row: DetailRow): PlanningWarning[] {
  const value = parsedJson(row.planning_warnings ?? row.planning_warnings_json);
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is PlanningWarning =>
      isRecord(entry) &&
      typeof entry.code === "string" &&
      (entry.level === "info" || entry.level === "warning") &&
      typeof entry.text === "string",
  );
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
      planning_source: observation.planning_source,
      planning_alternatives: observation.planning_alternatives,
      planning_warnings: observation.planning_warnings,
      observation_grain: observation.observation_grain,
      po_item_count: observation.po_item_count,
      po_item_ids: observation.po_item_ids,
      dock_to_stock_days: observation.dock_to_stock_days,
      candidate_ids: observation.candidate_ids,
      variance_days:
        (isComplete
          ? observation.complete_variance_days
          : observation.first_variance_days) ??
        (observation.plan_days != null ? value - observation.plan_days : null),
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
    const planningSource = planningSourceFromRow(profileRow);
    const planningAlternatives = planningAlternativesFromRow(profileRow);
    const planningWarnings = planningWarningsFromRow(profileRow);
    const derivedPoItemIds = Array.from(
      new Set(
        group
          .map((row) => row.po_item ?? row.po_item_norm)
          .filter(
            (value): value is string | number =>
              typeof value === "string" || typeof value === "number",
          )
          .map(String),
      ),
    ).sort();
    const suppliedPoItemIds = stringArray(
      profileRow.po_item_ids ?? profileRow.po_item_ids_json,
    );
    const poItemIds =
      suppliedPoItemIds.length > 0 ? suppliedPoItemIds : derivedPoItemIds;
    const planDays =
      typeof profileRow.plan_days === "number" ? profileRow.plan_days : null;
    const hasProfileMetadata =
      planDays != null ||
      profileRow.planning_profile_id != null ||
      profileRow.receipt_basis != null ||
      profileRow.vendor_id != null ||
      profileRow.vendor_name != null ||
      planningSource != null ||
      planningAlternatives.length > 0 ||
      planningWarnings.length > 0 ||
      profileRow.observation_grain != null ||
      profileRow.po_item_count != null ||
      profileRow.po_item_ids != null ||
      profileRow.po_item_ids_json != null;
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
      planning_source: planningSource,
      planning_alternatives: planningAlternatives,
      planning_warnings: planningWarnings,
      observation_grain:
        typeof profileRow.observation_grain === "string"
          ? profileRow.observation_grain
          : "purchase_order",
      po_item_count:
        typeof profileRow.po_item_count === "number"
          ? profileRow.po_item_count
          : poItemIds.length,
      po_item_ids: poItemIds,
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
