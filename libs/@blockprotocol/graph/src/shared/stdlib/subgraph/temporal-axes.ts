import type { Subgraph } from "../../types/subgraph.js";
import { isTemporalSubgraph } from "../../types/subgraph.js";
import type {
  BoundedTimeInterval,
  TimeInterval,
} from "../../types/temporal-versioning.js";
import { intervalForTimestamp } from "../interval.js";

// Separated out to improve the ergonomics of the `as` cast in the function, which is required due to limitations of TS
type LatestInstantInterval<Temporal extends boolean> = Temporal extends true
  ? BoundedTimeInterval
  : TimeInterval;

/**
 * For a given {@link Subgraph} that supports temporal versioning, this returns a {@link TimeInterval} that spans
 * the instant in time which is at the end of the {@link Subgraph}'s {@link VariableTemporalAxis}. For a
 * {@link Subgraph} that does _not_ support temporal versioning, an unbounded {@link TimeInterval} is returned
 * that spans the whole axis.
 *
 * @param {Subgraph} subgraph
 */
export const getLatestInstantIntervalForSubgraph = <Temporal extends boolean>(
  subgraph: Subgraph<Temporal>,
): LatestInstantInterval<Temporal> => {
  if (isTemporalSubgraph(subgraph)) {
    const subgraphEndBound =
      subgraph.temporalAxes.resolved.variable.interval.end;
    return intervalForTimestamp(subgraphEndBound.limit);
  } else {
    return {
      start: {
        kind: "unbounded",
      },
      end: {
        kind: "unbounded",
      },
    } as LatestInstantInterval<Temporal>;
  }
};
