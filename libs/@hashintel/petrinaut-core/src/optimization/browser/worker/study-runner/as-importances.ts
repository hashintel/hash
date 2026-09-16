import type { OptimizerImportances } from "../../messages";

/**
 * The importances block when it is well formed, else nothing: an estimate is
 * a garnish on the event, never a reason to fail the study.
 */
export const asImportances = (
  value: unknown,
): OptimizerImportances | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const { values, completedTrials } = value as Record<string, unknown>;
  if (
    typeof values !== "object" ||
    values === null ||
    Array.isArray(values) ||
    typeof completedTrials !== "number" ||
    !Number.isInteger(completedTrials) ||
    completedTrials < 1
  ) {
    return undefined;
  }
  const shares: Record<string, number> = {};
  for (const [identifier, share] of Object.entries(values)) {
    if (typeof share !== "number" || !(share >= 0 && share <= 1)) {
      return undefined;
    }
    shares[identifier] = share;
  }
  return { values: shares, completedTrials };
};
