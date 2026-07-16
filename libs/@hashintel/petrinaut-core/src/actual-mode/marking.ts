import type {
  ActualModeMarking,
  ActualModeTokenColour,
  ActualModeTransitionFiring,
} from "./types";

export const isActualModeTokenColourArray = (
  markingValue: number | ActualModeTokenColour[] | undefined,
): markingValue is ActualModeTokenColour[] => Array.isArray(markingValue);

export const getActualModePlaceMarkingTokenCount = (
  markingValue: number | ActualModeTokenColour[] | undefined,
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

const cloneTokenColour = (
  token: ActualModeTokenColour,
): ActualModeTokenColour => ({ ...token });

const cloneMarkingValue = (
  markingValue: number | ActualModeTokenColour[],
): number | ActualModeTokenColour[] =>
  Array.isArray(markingValue)
    ? markingValue.map((token) => cloneTokenColour(token))
    : markingValue;

const cloneMarking = (marking: ActualModeMarking): ActualModeMarking =>
  Object.fromEntries(
    Object.entries(marking).map(([placeId, value]) => [
      placeId,
      cloneMarkingValue(value),
    ]),
  );

const emptyTokens = (count: number): ActualModeTokenColour[] =>
  Array.from(
    { length: getActualModePlaceMarkingTokenCount(count) },
    () => ({}),
  );

const toTokenArray = (
  markingValue: number | ActualModeTokenColour[] | undefined,
): ActualModeTokenColour[] => {
  if (markingValue === undefined) {
    return [];
  }

  return Array.isArray(markingValue)
    ? markingValue.map((token) => cloneTokenColour(token))
    : emptyTokens(markingValue);
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
  ]);

  for (const placeId of placeIds) {
    const currentValue = next[placeId];
    const inputValue = firing.input[placeId];
    const outputValue = firing.output[placeId];

    if (
      Array.isArray(currentValue) ||
      Array.isArray(inputValue) ||
      Array.isArray(outputValue)
    ) {
      const currentTokens = toTokenArray(currentValue);
      const inputCount = getActualModePlaceMarkingTokenCount(inputValue);
      const outputTokens = toTokenArray(outputValue);
      next[placeId] = currentTokens.slice(inputCount).concat(outputTokens);
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
