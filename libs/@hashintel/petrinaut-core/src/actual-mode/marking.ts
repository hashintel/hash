import { createUserKeyedRecord } from "../validation/record-keys";

import type {
  ActualModeMarking,
  ActualModeTokenRecord,
  ActualModeTransitionFiring,
} from "./types";

export const isActualModeTokenColourArray = (
  markingValue: number | ActualModeTokenRecord[] | undefined,
): markingValue is ActualModeTokenRecord[] => Array.isArray(markingValue);

export const getActualModePlaceMarkingTokenCount = (
  markingValue: number | ActualModeTokenRecord[] | undefined,
): number => {
  if (markingValue === undefined) {
    return 0;
  }

  return isActualModeTokenColourArray(markingValue)
    ? markingValue.length
    : Number.isFinite(markingValue)
      ? Math.max(0, Math.floor(markingValue))
      : 0;
};

const cloneTokenRecord = (
  token: ActualModeTokenRecord,
): ActualModeTokenRecord => ({
  ...token,
});

const cloneMarkingValue = (
  markingValue: number | ActualModeTokenRecord[],
): number | ActualModeTokenRecord[] =>
  Array.isArray(markingValue)
    ? markingValue.map((token) => cloneTokenRecord(token))
    : markingValue;

// Keyed by place ids from recorded firings: no prototype, so the writes in
// `applyActualModeTransitionFiring` stay ordinary own properties.
const cloneMarking = (marking: ActualModeMarking): ActualModeMarking => {
  const next: ActualModeMarking = createUserKeyedRecord();
  for (const [placeId, value] of Object.entries(marking)) {
    next[placeId] = cloneMarkingValue(value);
  }
  return next;
};

const emptyTokens = (count: number): ActualModeTokenRecord[] =>
  Array.from(
    { length: getActualModePlaceMarkingTokenCount(count) },
    () => ({}),
  );

const toTokenArray = (
  markingValue: number | ActualModeTokenRecord[] | undefined,
): ActualModeTokenRecord[] => {
  if (markingValue === undefined) {
    return [];
  }

  return Array.isArray(markingValue)
    ? markingValue.map((token) => cloneTokenRecord(token))
    : emptyTokens(markingValue);
};

/**
 * A recorded token value may carry only a subset of the colour's attributes
 * (at least the identity key elements), so a marking token matches when it
 * agrees on every attribute the record carries.
 */
const tokenMatchesRecordedValues = (
  token: ActualModeTokenRecord,
  recordedToken: ActualModeTokenRecord,
): boolean =>
  Object.entries(recordedToken).every(
    ([attributeName, attributeValue]) =>
      token[attributeName] === attributeValue,
  );

/**
 * Removes the consumed tokens from a place's token array. Tokens matching
 * the recorded values are removed by value; a recorded token with no match
 * (or consumption beyond the recorded values) falls back to FIFO so the
 * count always drops by the firing's `input` count.
 */
const removeConsumedTokens = (
  currentTokens: ActualModeTokenRecord[],
  inputCount: number,
  recordedInputTokens: ActualModeTokenRecord[] | undefined,
): ActualModeTokenRecord[] => {
  if (!recordedInputTokens || recordedInputTokens.length === 0) {
    return currentTokens.slice(inputCount);
  }

  const remaining = [...currentTokens];
  for (const recordedToken of recordedInputTokens) {
    const matchIndex = remaining.findIndex((token) =>
      tokenMatchesRecordedValues(token, recordedToken),
    );
    remaining.splice(matchIndex === -1 ? 0 : matchIndex, 1);
  }

  const extraConsumed = inputCount - recordedInputTokens.length;
  return extraConsumed > 0 ? remaining.slice(extraConsumed) : remaining;
};

export const applyActualModeTransitionFiring = (
  marking: ActualModeMarking,
  firing: ActualModeTransitionFiring,
): ActualModeMarking => {
  const next = cloneMarking(marking);
  const placeIds = new Set([
    ...Object.keys(next),
    ...Object.keys(firing.input),
    ...Object.keys(firing.output),
    ...Object.keys(firing.inputTokens ?? {}),
    ...Object.keys(firing.outputTokens ?? {}),
  ]);

  for (const placeId of placeIds) {
    const currentValue = next[placeId];
    const inputValue = firing.input[placeId];
    const outputValue = firing.output[placeId];
    const recordedInputTokens = firing.inputTokens?.[placeId];
    const recordedOutputTokens = firing.outputTokens?.[placeId];

    if (
      Array.isArray(currentValue) ||
      Array.isArray(inputValue) ||
      Array.isArray(outputValue) ||
      recordedInputTokens !== undefined ||
      recordedOutputTokens !== undefined
    ) {
      const currentTokens = toTokenArray(currentValue);
      const inputCount = getActualModePlaceMarkingTokenCount(inputValue);
      const remainingTokens = removeConsumedTokens(
        currentTokens,
        inputCount,
        recordedInputTokens,
      );
      const producedTokens =
        recordedOutputTokens && recordedOutputTokens.length > 0
          ? recordedOutputTokens.map((token) => cloneTokenRecord(token))
          : toTokenArray(outputValue);
      next[placeId] = remainingTokens.concat(producedTokens);
      continue;
    }

    next[placeId] =
      (currentValue ?? 0) - (inputValue ?? 0) + (outputValue ?? 0);
  }

  return next;
};

export const getActualModeMarkingAtTransitionFiringIndex = (params: {
  initialState: ActualModeMarking;
  transitionFirings: readonly ActualModeTransitionFiring[];
  transitionFiringIndex: number | null;
}): ActualModeMarking => {
  const { initialState, transitionFiringIndex, transitionFirings } = params;

  if (transitionFiringIndex === null) {
    return initialState;
  }

  let marking = initialState;

  // TODO(actual-mode follow-up): this reconstructs markings by replaying from
  // the beginning for each requested frame. That is acceptable for this first
  // Brunch integration, but large streams need a prefix marking cache or
  // incremental timeline reader so scrubbing does not become O(n^2).
  for (let index = 0; index <= transitionFiringIndex; index += 1) {
    const firing = transitionFirings[index];

    if (firing) {
      marking = applyActualModeTransitionFiring(marking, firing);
    }
  }

  return marking;
};
