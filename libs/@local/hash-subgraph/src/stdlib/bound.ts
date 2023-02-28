import { compareBounds as compareBoundsBp } from "@blockprotocol/graph/temporal/stdlib";

import { TemporalBound, TimeInterval } from "../main";

export const compareBounds = (
  left: TemporalBound,
  right: TemporalBound,
  leftType: keyof TimeInterval,
  rightType: keyof TimeInterval,
): number => compareBoundsBp(left, right, leftType, rightType);
