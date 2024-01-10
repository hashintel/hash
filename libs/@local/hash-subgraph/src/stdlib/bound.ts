// import { compareBounds as compareBoundsBp } from "@blockprotocol/graph/temporal/stdlib";
import * as temporal from "@blockprotocol/graph/temporal/stdlib";

import type { TemporalBound, TimeInterval } from "../main";

export const compareBounds = (
  left: TemporalBound,
  right: TemporalBound,
  leftType: keyof TimeInterval,
  rightType: keyof TimeInterval,
): number => temporal.compareBounds(left, right, leftType, rightType);
