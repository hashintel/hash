import type { ActionStepCheck } from "./types.js";

/**
 * Checks the count of a Take first step: a whole number, 0 or more. Run when the flow is defined for a constant
 * count, and by the step for a count from an earlier step.
 */
export const validateTakeCount = (count: number): string | undefined =>
  Number.isInteger(count) && count >= 0
    ? undefined
    : "The count must be a whole number, 0 or more.";

/** Checks a Take first step's constant `count` when the flow is defined. */
export const checkTakeCountInput: ActionStepCheck = ({ step, report }) => {
  const source = step.inputs.count;

  /* A count of another shape is reported as an incompatible connection. */
  if (
    source?.kind !== "constant" ||
    source.payload.kind !== "Number" ||
    typeof source.payload.value !== "number"
  ) {
    return;
  }

  const error = validateTakeCount(source.payload.value);

  if (error) {
    report("count", error);
  }
};
