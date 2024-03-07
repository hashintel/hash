import {
  PinnedTemporalAxis,
  PinnedTemporalAxisUnresolved,
  VariableTemporalAxis,
  VariableTemporalAxisUnresolved,
} from "../temporal-versioning.js";

/**
 * Defines the two possible combinations of pinned/variable temporal axes that are used in queries that return
 * {@link Subgraph}`s.
 *
 * The {@link VariableTemporalAxisUnresolved} is optionally bounded, in the absence of provided bounds an inclusive
 * bound at the timestamp at point of resolving is assumed.
 */
export type QueryTemporalAxesUnresolved =
  | {
      variable: VariableTemporalAxisUnresolved<"decisionTime">;
      pinned: PinnedTemporalAxisUnresolved<"transactionTime">;
    }
  | {
      variable: VariableTemporalAxisUnresolved<"transactionTime">;
      pinned: PinnedTemporalAxisUnresolved<"decisionTime">;
    };

/**
 * Defines the two possible combinations of pinned/variable temporal axes that are used in responses to queries that
 * return {@link Subgraph}`s.
 *
 * The {@link VariableTemporalAxis} is bounded according to the input of the query.
 */
export type QueryTemporalAxes =
  | {
      variable: VariableTemporalAxis<"decisionTime">;
      pinned: PinnedTemporalAxis<"transactionTime">;
    }
  | {
      variable: VariableTemporalAxis<"transactionTime">;
      pinned: PinnedTemporalAxis<"decisionTime">;
    };

/**
 * Denotes the temporal axes used in constructing the {@link Subgraph}.
 */
export type SubgraphTemporalAxes = {
  /**
   * The {@link QueryTemporalAxesUnresolved} provided in the query
   */
  initial: QueryTemporalAxesUnresolved;
  /**
   * The {@link QueryTemporalAxes} used when resolving the {@link Subgraph}
   */
  resolved: QueryTemporalAxes;
};
