export type TrendTone = "up" | "down" | "flat";

/** Tone for a percentage change: identical (rounds to 0%) is flat, null is no trend. */
export function trendToneFor(
  pctChange: number | null | undefined,
): TrendTone | null {
  if (pctChange == null) {
    return null;
  }
  if (Math.round(pctChange) === 0) {
    return "flat";
  }
  return pctChange > 0 ? "up" : "down";
}
