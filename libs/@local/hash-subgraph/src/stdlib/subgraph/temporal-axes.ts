import type { Subgraph as SubgraphBp } from "@blockprotocol/graph/temporal";
import { getLatestInstantIntervalForSubgraph as getLatestInstantIntervalForSubgraphBp } from "@blockprotocol/graph/temporal/stdlib";

import type { BoundedTimeInterval, Subgraph } from "../../main";

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
): BoundedTimeInterval =>
  getLatestInstantIntervalForSubgraphBp(
    subgraph as unknown as SubgraphBp,
  ) as BoundedTimeInterval;
