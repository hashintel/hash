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
  recordedAttributes: readonly [string, ActualModeTokenRecord[string]][],
): boolean =>
  recordedAttributes.every(
    ([attributeName, attributeValue]) =>
      token[attributeName] === attributeValue,
  );

/**
 * Removes the consumed tokens from a place's token array. The firing's
 * `input` count is authoritative: at most `inputCount` tokens are removed
 * (recorded values beyond it are ignored), and consumption beyond the
 * recorded values falls back to FIFO. Recorded tokens are removed by value;
 * a recorded token with no match in the reconstructed marking removes
 * nothing — keeping a divergent token beats corrupting another instance —
 * so the place's count can exceed the count-only projection until stream
 * and reconstruction re-converge. See `actual-mode/README.md`.
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
  const consumedRecords = recordedInputTokens.slice(0, inputCount);
  for (const recordedToken of consumedRecords) {
    const recordedAttributes = Object.entries(recordedToken);
    const matchIndex = remaining.findIndex((token) =>
      tokenMatchesRecordedValues(token, recordedAttributes),
    );
    if (matchIndex !== -1) {
      remaining.splice(matchIndex, 1);
    }
  }

  const unrecordedConsumed = inputCount - consumedRecords.length;
  return unrecordedConsumed > 0
    ? remaining.slice(unrecordedConsumed)
    : remaining;
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
      // The `output` count is authoritative for how many tokens appear:
      // recorded values fill the first slots and the rest are padded with
      // attribute-less tokens, so partial recordings keep counts consistent.
      const outputCount = getActualModePlaceMarkingTokenCount(outputValue);
      const producedTokens =
        recordedOutputTokens && recordedOutputTokens.length > 0
          ? recordedOutputTokens
              .map((token) => cloneTokenRecord(token))
              .concat(emptyTokens(outputCount - recordedOutputTokens.length))
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
