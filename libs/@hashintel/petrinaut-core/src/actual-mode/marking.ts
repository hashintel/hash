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

const hasAttributes = (token: ActualModeTokenRecord): boolean =>
  Object.keys(token).length > 0;

/**
 * Removes the consumed tokens from a place's token array. Each recorded token
 * removes the first marking token that agrees on every attribute it carries,
 * so an attribute-less record removes the oldest token. A recorded token with
 * no match removes nothing: keeping a divergent token beats removing another
 * instance's token. See `actual-mode/README.md`.
 */
const removeConsumedTokens = (
  currentTokens: ActualModeTokenRecord[],
  consumedTokens: readonly ActualModeTokenRecord[],
): ActualModeTokenRecord[] => {
  const remaining = [...currentTokens];
  for (const consumedToken of consumedTokens) {
    const recordedAttributes = Object.entries(consumedToken);
    const matchIndex = remaining.findIndex((token) =>
      tokenMatchesRecordedValues(token, recordedAttributes),
    );
    if (matchIndex !== -1) {
      remaining.splice(matchIndex, 1);
    }
  }
  return remaining;
};

/**
 * A place stays a token count while every token recorded for it is
 * attribute-less; the first attribute-carrying token turns it into an array.
 */
export const applyActualModeTransitionFiring = (
  marking: ActualModeMarking,
  firing: ActualModeTransitionFiring,
): ActualModeMarking => {
  const next = cloneMarking(marking);
  const placeIds = new Set([
    ...Object.keys(firing.inputTokens),
    ...Object.keys(firing.outputTokens),
  ]);

  for (const placeId of placeIds) {
    const currentValue = next[placeId];
    const consumedTokens = firing.inputTokens[placeId] ?? [];
    const producedTokens = firing.outputTokens[placeId] ?? [];

    if (
      !Array.isArray(currentValue) &&
      !consumedTokens.some(hasAttributes) &&
      !producedTokens.some(hasAttributes)
    ) {
      next[placeId] =
        (currentValue ?? 0) - consumedTokens.length + producedTokens.length;
      continue;
    }

    next[placeId] = removeConsumedTokens(
      toTokenArray(currentValue),
      consumedTokens,
    ).concat(producedTokens.map((token) => cloneTokenRecord(token)));
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
