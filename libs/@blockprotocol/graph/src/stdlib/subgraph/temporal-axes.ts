import type {
  ClosedTemporalBound,
  TemporalInterval,
} from "@blockprotocol/type-system";

import type { Subgraph } from "../../types/subgraph.js";
import { intervalForTimestamp } from "../interval.js";

/**
 * For a given {@link Subgraph} that supports temporal versioning, this returns a {@link TimeInterval} that spans
 * the instant in time which is at the end of the {@link Subgraph}'s {@link VariableTemporalAxis}. For a
 * {@link Subgraph} that does _not_ support temporal versioning, an unbounded {@link TimeInterval} is returned
 * that spans the whole axis.
 *
 * @param {Subgraph} subgraph
 */
export const getLatestInstantIntervalForSubgraph = (
  subgraph: Subgraph,
): TemporalInterval<ClosedTemporalBound, ClosedTemporalBound> => {
  const subgraphEndBound = subgraph.temporalAxes.resolved.variable.interval.end;
  return intervalForTimestamp(subgraphEndBound.limit);
};
