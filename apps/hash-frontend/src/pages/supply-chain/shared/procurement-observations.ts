import type { ProcurementBasis } from "./procurement-basis-context";
import type { Observation, ProcurementNodeObservation } from "./types";

type DetailRow = Record<string, unknown>;

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
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
    return {
      date: isComplete
        ? observation.last_receipt_date
        : observation.first_receipt_date,
      value: isComplete
        ? observation.last_receipt_value
        : observation.first_receipt_value,
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

  for (const group of byPo.values()) {
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

    first.push({ date: firstDate, value: firstValue });
    complete.push({ date: lastDate, value: lastValue });
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
