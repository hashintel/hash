import { createUserKeyedRecord } from "../validation/record-keys";

import type {
  ActualModeTokenRecord,
  ActualModeTokenValues,
  ActualModeTransitionFiring,
} from "./types";

/** Token counts per place, the form of `input`/`output` on legacy firings. */
export type ActualModeLegacyTokenCounts = Record<string, number>;

/**
 * A transition firing as emitters and recordings may carry it: token values
 * under `inputTokens`/`outputTokens`, or the legacy count-only form under
 * `input`/`output`, or both.
 */
export type ActualModeTransitionFiringWire = {
  transitionId: string;
  input?: ActualModeLegacyTokenCounts;
  output?: ActualModeLegacyTokenCounts;
  inputTokens?: ActualModeTokenValues;
  outputTokens?: ActualModeTokenValues;
  ts: string;
};

const toTokenCount = (count: number): number =>
  Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;

/**
 * Reconciles a legacy count map with recorded token values: the count decides
 * how many tokens a place lost or gained, so recorded values beyond it are
 * dropped and a shortfall is padded with attribute-less records. Without a
 * count map the recorded values stand as they are.
 */
export const normalizeActualModeTokenValues = (
  counts: ActualModeLegacyTokenCounts | undefined,
  values: ActualModeTokenValues | undefined,
): ActualModeTokenValues => {
  if (counts === undefined) {
    return values ?? {};
  }

  const normalized: ActualModeTokenValues =
    createUserKeyedRecord<ActualModeTokenRecord[]>();
  const placeIds = new Set([
    ...Object.keys(counts),
    ...Object.keys(values ?? {}),
  ]);

  for (const placeId of placeIds) {
    const count = counts[placeId];
    const recorded = values?.[placeId] ?? [];

    if (count === undefined) {
      normalized[placeId] = recorded;
      continue;
    }

    const tokenCount = toTokenCount(count);
    normalized[placeId] = recorded
      .slice(0, tokenCount)
      .concat(Array.from({ length: tokenCount - recorded.length }, () => ({})));
  }

  return normalized;
};

export const normalizeActualModeTransitionFiring = (
  firing: ActualModeTransitionFiringWire,
): ActualModeTransitionFiring => ({
  transitionId: firing.transitionId,
  inputTokens: normalizeActualModeTokenValues(firing.input, firing.inputTokens),
  outputTokens: normalizeActualModeTokenValues(
    firing.output,
    firing.outputTokens,
  ),
  ts: firing.ts,
});
