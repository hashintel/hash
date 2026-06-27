/**
 * Tooltip helpers for planning parameter chips.
 *
 * The planning parameter is the system's planned time for a step. Which planned
 * time applies depends on the step type:
 *   - Procurement / Transit → planned delivery time (days)
 *   - Production            → goods-receipt processing time (days)
 *   - Upstream production   → in-house production time (days)
 *
 * `plan_note` on the graph node is set by generate_data.py only when the
 * planned time is not the default planned delivery time.
 */

export function planSourceLabel(planNote: string | null | undefined): string {
  if (planNote) {
    return `Planning parameter — ${planNote}`;
  }
  return "Planning parameter (planned delivery time)";
}

export function pctChangeTooltip(
  pctChange: number,
  plan: number,
  measureLabel = "Median",
): string {
  const abs = Math.abs(pctChange).toFixed(0);
  if (pctChange > 0) {
    return `${measureLabel} exceeds the ${plan}d planning parameter by ${abs}%`;
  }
  return `${measureLabel} is ${abs}% below the ${plan}d planning parameter`;
}
