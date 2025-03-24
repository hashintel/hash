/**
 * Types used in embedding applications and blocks that support multi-axis temporal versioning schemes.
 */

import type {
  LimitedTemporalBound,
  TemporalBound,
  TemporalInterval,
  Timestamp,
} from "@blockprotocol/type-system";

/**
 * @todo - doc
 */
export type TemporalAxis = "transactionTime" | "decisionTime";

/**
 * A representation of an interval of time, where the bounds of the interval may be omitted (represented by `null`) to
 * be post-processed at a later stage.
 *
 * An example of how this may be useful is taking an interval that statically should refer to "the current time".
 * Leaving a bound unspecified means that the `null` can be replaced at time of resolution with the current clock, while
 * leaving the parameters of the query as statically defined.
 */
export type TimeIntervalUnresolved<
  StartBound extends TemporalBound | null,
  EndBound extends TemporalBound | null,
> = {
  start: StartBound;
  end: EndBound;
};

/**
 * A representation of a "variable" temporal axis, which is optionally bounded to a given interval where some of the
 * bounds may have been omitted for later processing (see {@link TimeIntervalUnresolved}), whereby `null` values are
 * replaced with inclusive bounds referring the current {@link Timestamp}.
 *
 * In a bitemporal system, a {@link VariableTemporalAxisUnresolved} should almost always be accompanied by a
 * {@link PinnedTemporalAxisUnresolved}.
 */
export type VariableTemporalAxisUnresolved<
  Axis extends TemporalAxis,
  StartBound extends TemporalBound | null = TemporalBound | null,
  EndBound extends LimitedTemporalBound | null = LimitedTemporalBound | null,
> = {
  axis: Axis;
  interval: TimeIntervalUnresolved<StartBound, EndBound>;
};

/**
 * A representation of a "variable" temporal axis, which bounded to a given {@link TimeInterval} where the end of the
 * interval must be limited by a {@link Timestamp}
 *
 * In a bitemporal system, a {@link VariableTemporalAxis} should almost always be accompanied by a
 * {@link PinnedTemporalAxis}.
 */
export type VariableTemporalAxis<
  Axis extends TemporalAxis,
  StartBound extends TemporalBound = TemporalBound,
  EndBound extends LimitedTemporalBound = LimitedTemporalBound,
> = {
  axis: Axis;
  interval: TemporalInterval<StartBound, EndBound>;
};

/**
 * A representation of a "pinned" temporal axis, used to project another temporal axis along the given
 * {@link Timestamp}. If the `timestamp` is set to `null`, then it will be filled in with the current time _when a query
 * is being resolved._
 *
 * In a bitemporal system, a {@link PinnedTemporalAxisUnresolved} should almost always be accompanied by a
 * {@link VariableTemporalAxisUnresolved}.
 */
export type PinnedTemporalAxisUnresolved<
  Axis extends TemporalAxis,
  PinnedTime extends Timestamp | null = Timestamp | null,
> = {
  axis: Axis;
  timestamp: PinnedTime;
};

/**
 * A representation of a "pinned" temporal axis, used to project another temporal axis along the given
 * {@link Timestamp}.
 *
 * In a bitemporal system, a {@link PinnedTemporalAxis} should almost always be accompanied by a
 * {@link VariableTemporalAxis}.
 */
export type PinnedTemporalAxis<
  Axis extends TemporalAxis,
  PinnedTime extends Timestamp = Timestamp,
> = {
  axis: Axis;
  timestamp: PinnedTime;
};
