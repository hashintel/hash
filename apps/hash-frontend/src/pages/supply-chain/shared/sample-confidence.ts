export const LOW_SAMPLE_MIN = 5;
export const GOOD_SAMPLE_MIN = 10;

export type SampleTier = "none" | "low" | "limited" | "good";

export const sampleTier = (count: number): SampleTier => {
  if (count <= 0) {
    return "none";
  }
  if (count < LOW_SAMPLE_MIN) {
    return "low";
  }
  if (count < GOOD_SAMPLE_MIN) {
    return "limited";
  }
  return "good";
};

/** Return the weakest populated tier across current/previous periods. */
export const combinedSampleTier = (
  ...counts: (number | null | undefined)[]
): SampleTier => {
  const tiers = counts
    .filter((count): count is number => count != null && count > 0)
    .map(sampleTier);
  if (tiers.includes("low")) {
    return "low";
  }
  if (tiers.includes("limited")) {
    return "limited";
  }
  if (tiers.includes("good")) {
    return "good";
  }
  return "none";
};

/** The "exclude low samples" setting retains limited (5–9) samples. */
export const isExcludedLowSample = (count: number): boolean =>
  count < LOW_SAMPLE_MIN;
