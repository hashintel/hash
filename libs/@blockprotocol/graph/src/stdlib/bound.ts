import type {
  TemporalBound,
  TimeInterval,
} from "../types/temporal-versioning.js";

export const compareBounds = (
  left: TemporalBound,
  right: TemporalBound,
  leftType: keyof TimeInterval,
  rightType: keyof TimeInterval,
): number => {
  // If the bound values are not equal, then the bound with the lower value is less than the bound with the higher
  // value.
  if (left.kind !== "unbounded" && right.kind !== "unbounded") {
    if (left.limit !== right.limit) {
      return left.limit.localeCompare(right.limit);
    }
  }

  if (
    (left.kind === "unbounded" &&
      right.kind === "unbounded" &&
      leftType === "start" &&
      rightType === "start") ||
    (left.kind === "unbounded" &&
      right.kind === "unbounded" &&
      leftType === "end" &&
      rightType === "end") ||
    (left.kind === "exclusive" &&
      right.kind === "exclusive" &&
      leftType === "start" &&
      rightType === "start") ||
    (left.kind === "exclusive" &&
      right.kind === "exclusive" &&
      leftType === "end" &&
      rightType === "end") ||
    (left.kind === "inclusive" && right.kind === "inclusive")
  ) {
    return 0;
  }

  if (
    (left.kind === "unbounded" && leftType === "start") ||
    (right.kind === "unbounded" && rightType === "end") ||
    (left.kind === "exclusive" &&
      right.kind === "exclusive" &&
      leftType === "end" &&
      rightType === "start") ||
    (left.kind === "exclusive" &&
      right.kind === "inclusive" &&
      leftType === "end") ||
    (left.kind === "inclusive" &&
      right.kind === "exclusive" &&
      rightType === "start")
  ) {
    return -1;
  }

  if (
    (left.kind === "unbounded" && leftType === "end") ||
    (right.kind === "unbounded" && rightType === "start") ||
    (left.kind === "exclusive" &&
      right.kind === "exclusive" &&
      leftType === "start" &&
      rightType === "end") ||
    (left.kind === "exclusive" &&
      right.kind === "inclusive" &&
      leftType === "start") ||
    (left.kind === "inclusive" &&
      right.kind === "exclusive" &&
      rightType === "end")
  ) {
    return 1;
  }
  throw new Error(
    `Implementation error, failed to compare bounds.\nLHS: ${JSON.stringify(
      left,
    )}\nLHS Type: ${leftType}\nRHS: ${JSON.stringify(
      right,
    )}\nRHS Type: ${rightType}`,
  );
};

/**
 * Checks whether two given temporal bounds are adjacent to one another, where adjacency is defined as being next to one
 * another on the timeline, without any points between, *and where they are not overlapping*.
 *
 * As such, two inclusive (or two exclusive) bounds with the same limit are *not* adjacent.
 *
 * @param left - The first bound of the comparison (order is unimportant)
 * @param right - The second bound of the comparison
 */
export const boundIsAdjacentToBound = (
  left: TemporalBound,
  right: TemporalBound,
): boolean => {
  if (
    (left.kind === "inclusive" && right.kind === "exclusive") ||
    (left.kind === "exclusive" && right.kind === "inclusive")
  ) {
    return left.limit === right.limit;
  } else {
    return false;
  }
};
