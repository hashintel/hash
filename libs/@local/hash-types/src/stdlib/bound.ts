import { compareBounds as compareBoundsBp } from "@blockprotocol/graph/stdlib";

import { TemporalBound, TimeInterval } from "../types/temporal-versioning";

export const compareBounds = (
  left: TemporalBound,
  right: TemporalBound,
  leftType: keyof TimeInterval,
  rightType: keyof TimeInterval,
): number => compareBoundsBp(left, right, leftType, rightType);
