export type TrendTone = "up" | "down" | "flat";

/** Tone for a percentage change: within ±5% is flat, null is no trend. */
export function trendToneFor(
  pctChange: number | null | undefined,
): TrendTone | null {
  if (pctChange == null) {
    return null;
  }
  if (Math.abs(pctChange) <= 5) {
    return "flat";
  }
  return pctChange > 0 ? "up" : "down";
}
