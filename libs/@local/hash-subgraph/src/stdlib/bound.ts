import { compareBounds as compareBoundsBp } from "@blockprotocol/graph/stdlib";
import type {
  TemporalBound,
  TemporalInterval,
} from "@blockprotocol/type-system";

export const compareBounds = (
  left: TemporalBound,
  right: TemporalBound,
  leftType: keyof TemporalInterval<TemporalBound, TemporalBound>,
  rightType: keyof TemporalInterval<TemporalBound, TemporalBound>,
): number => compareBoundsBp(left, right, leftType, rightType);
