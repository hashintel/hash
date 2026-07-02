import type { DetailRows } from "./types";

/**
 * Ordered fallback for which detail-row column holds the observation date when
 * a step does not carry an explicit `ref_date_col`. Union of every
 * per-dimension date column the views may key on (timing, dwell, consumption,
 * outbound), ordered so the completion/event date wins when several are
 * present.
 */
export const DETAIL_DATE_KEY_PREFERENCE = [
  "finish_date",
  "confirmed_finish",
  "end",
  "prod_receipt_date",
  "production_receipt_date",
  "qa_decision_date",
  "arrival_date",
  "qa_release_date",
  "outbound_date",
  "receipt_date",
  "consumption_date",
  "first_gr_date",
  "last_gr_date",
  "po_date",
  "promised_date",
  "ship_date",
  "departure_date",
  "sched_start",
  "posting_date",
  "start",
  "date",
];

/**
 * Resolve the detail-row date column. The canonical answer is the step's
 * `ref_date_col` (emitted by the generator for every step); the preference
 * list is only a fallback for payloads that don't carry one.
 */
export function detailDateKeyFromColumns(
  rows: DetailRows,
  refDateCol?: string | null,
): string | null {
  const keys = new Set(rows.columns.map((column) => column.key));
  if (refDateCol && keys.has(refDateCol)) {
    return refDateCol;
  }
  return DETAIL_DATE_KEY_PREFERENCE.find((key) => keys.has(key)) ?? null;
}
