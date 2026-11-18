/**
 * Separates a step's id from the index of the `for-each` item a run of the step is for. Step ids can't contain it.
 */
export const stepRunIdSeparator = "~";

/**
 * The id of the run of a step inside a `for-each` for one of its items: the step's id and the item's index.
 */
export type ForEachItemStepRunId =
  `${string}${typeof stepRunIdSeparator}${number}`;

export const generateStepRunId = (
  stepId: string,
  itemIndex: number,
): ForEachItemStepRunId => `${stepId}${stepRunIdSeparator}${itemIndex}`;

/**
 * The step a run is of, and the index of the `for-each` item it's for, if any. A run's id is its step's own id, or for
 * a step inside a `for-each`, a {@link ForEachItemStepRunId} per item.
 */
export const parseStepRunId = (
  stepRunId: string,
): { stepId: string; itemIndex?: number } => {
  const separatorIndex = stepRunId.indexOf(stepRunIdSeparator);

  if (separatorIndex === -1) {
    return { stepId: stepRunId };
  }

  return {
    stepId: stepRunId.slice(0, separatorIndex),
    itemIndex: Number(stepRunId.slice(separatorIndex + 1)),
  };
};
