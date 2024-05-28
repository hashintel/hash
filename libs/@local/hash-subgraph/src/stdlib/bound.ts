import { compareBounds as compareBoundsBp } from "@blockprotocol/graph/temporal/stdlib";
import type {
  TemporalBound,
  TimeInterval,
} from "@local/hash-graph-types/temporal-versioning";

export const compareBounds = (
  left: TemporalBound,
  right: TemporalBound,
  leftType: keyof TimeInterval,
  rightType: keyof TimeInterval,
): number => compareBoundsBp(left, right, leftType, rightType);
