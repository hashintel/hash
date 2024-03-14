import type {
  BoundedTimeInterval,
  LimitedTemporalBound,
  TemporalBound,
  TimeInterval,
  Timestamp,
} from "../types/temporal-versioning.js";
import { boundIsAdjacentToBound, compareBounds } from "./bound.js";

/**
 * Standard comparison function that returns whether `IntervalA` is before the `IntervalB`. Where "before"
 * is defined by first comparing the start bounds, and if those are equal, then the end bounds are compared.
 *
 * @param {TimeInterval} intervalA
 * @param {TimeInterval} intervalB
 */
export const intervalCompareWithInterval = (
  intervalA: TimeInterval,
  intervalB: TimeInterval,
): number => {
  const startComparison = compareBounds(
    intervalA.start,
    intervalB.start,
    "start",
    "start",
  );

  return startComparison !== 0
    ? startComparison
    : compareBounds(intervalA.end, intervalB.end, "end", "end");
};

/**
 * Sorts a given collection of {@link TimeInterval} in place, sorted first from earliest to latest start bounds, and
 * then earliest to latest end bounds.
 *
 * @param {TimeInterval[]} intervals
 */
export const sortIntervals = (intervals: TimeInterval[]) => {
  intervals.sort(intervalCompareWithInterval);
};

/**
 * Creates a {@link BoundedTimeInterval} that represents the instant of time identified by the given {@link Timestamp}.
 *
 * This is an interval where both bounds are `inclusive`, with limit points at the given {@link Timestamp}. Having an
 * `exclusive` start _or_ end would result in the interval never containing anything.
 *
 * @param {Timestamp} timestamp
 */
export const intervalForTimestamp = (
  timestamp: Timestamp,
): BoundedTimeInterval => {
  return {
    start: {
      kind: "inclusive",
      limit: timestamp,
    },
    end: {
      kind: "inclusive",
      limit: timestamp,
    },
  };
};

/**
 * Checks whether two given {@link TimeInterval}s are adjacent to one another, where adjacency is defined as
 * being next to one another on the timeline, without any points between, *and where they are not overlapping*. Thus,
 * if adjacent, the two intervals should span another given interval.
 *
 * @param {TimeInterval} left - The first interval of the comparison (order is unimportant)
 * @param {TimeInterval} right - The second interval of the comparison
 */
export const intervalIsAdjacentToInterval = (
  left: TimeInterval,
  right: TimeInterval,
): boolean => {
  /*
   Examples           |     1     |     2     |     3     |     4     |     5
   ===================|===========|===========|===========|===========|===========
   Interval A         | [---]     | [---)     | [---]     | [---)     | [-]
   Interval B         |     (---] |     [---] |     [---] |     (---] |      [--]
   -------------------|-----------|-----------|-----------|-----------|-----------
   Contains Interval  |   true    |   true    |   false   |   false   |   false
   */
  return (
    boundIsAdjacentToBound(left.end, right.start) ||
    boundIsAdjacentToBound(left.start, right.end)
  );
};

/**
 * Returns whether or not the `right` {@link TimeInterval} is *completely contained* within the `left`
 * {@link TimeInterval}.
 *
 * @param {TimeInterval} left - Checked if it contains the other
 * @param {TimeInterval} right - Checked if it's contained _within_ the other
 */
export const intervalContainsInterval = (
  left: TimeInterval,
  right: TimeInterval,
): boolean => {
  /*
   Examples           |     1     |     2     |     3     |     4     |     5     |     6
   ===================|===========|===========|===========|===========|===========|===========
   Interval A         |  [------] |   [----]  |   [----]  |   (----]  |   (----]  | [--]
   Interval B         |    [--]   |   [---]   |   (---]   |   (---]   |   [---]   |   [---]
   -------------------|-----------|-----------|-----------|-----------|-----------|-----------
   Contains Interval  |   true    |   true    |   true    |   true    |   false   |   false
   */
  return (
    compareBounds(left.start, right.start, "start", "start") <= 0 &&
    compareBounds(left.end, right.end, "end", "end") >= 0
  );
};

/**
 * Returns whether or not the given {@link Timestamp} falls within the span of a given {@link TimeInterval}.
 *
 * @param {TimeInterval} interval
 * @param {Timestamp} timestamp
 */
export const intervalContainsTimestamp = (
  interval: TimeInterval,
  timestamp: Timestamp,
): boolean => {
  const timestampAsBound: LimitedTemporalBound = {
    kind: "inclusive",
    limit: timestamp,
  };
  /*
   Examples            |     1     |     2     |     3     |     4
   ====================|===========|===========|===========|===========
   Interval            |    [----] |   (--]    |  [--)     | [--]
   Timestamp           |      .    |      .    |     .     |       .
   --------------------|-----------|-----------|-----------|-----------
   Contains Timestamp  |   true    |   true    |   false   |   false
   */
  return (
    compareBounds(interval.start, timestampAsBound, "start", "start") <= 0 &&
    compareBounds(interval.end, timestampAsBound, "end", "end") >= 0
  );
};

/**
 * Checks whether there is *any* overlap between two {@link TimeInterval}
 *
 * @param {TimeInterval} left
 * @param {TimeInterval} right
 */
export const intervalOverlapsInterval = (
  left: TimeInterval,
  right: TimeInterval,
): boolean => {
  /*
   Examples |     1     |     2     |     3     |     4
   =========|===========|===========|===========|===========
   Range A  |    [----] | [--]      | [--]      | [--]
   Range B  | [-----]   |    [--]   |    (--]   |       (--]
   ---------|-----------|-----------|-----------|-----------
   Overlaps |   true    |   true    |   false   |   false
   */
  return (
    (compareBounds(left.start, right.start, "start", "start") >= 0 &&
      compareBounds(left.start, right.end, "start", "end") <= 0) ||
    (compareBounds(right.start, left.start, "start", "start") >= 0 &&
      compareBounds(right.start, left.end, "start", "end") <= 0)
  );
};

/**
 * Advanced type to provide stronger type information when using {@link intervalIntersectionWithInterval}.
 *
 * If *either* of the `start` {@link TemporalBound}s is bounded, then the resultant `start` {@link TemporalBound} will
 * be bounded, same goes for `end` {@link TemporalBound}s respectively
 */
type IntersectionReturn<
  LeftInterval extends TimeInterval,
  RightInterval extends TimeInterval,
> = [LeftInterval, RightInterval] extends [
  TimeInterval<infer LeftStartBound, infer LeftEndBound>,
  TimeInterval<infer RightStartBound, infer RightEndBound>,
]
  ? TimeInterval<
      LeftStartBound | RightStartBound extends LimitedTemporalBound
        ? LimitedTemporalBound
        : TemporalBound,
      LeftEndBound | RightEndBound extends LimitedTemporalBound
        ? LimitedTemporalBound
        : TemporalBound
    >
  : never;

/**
 * Returns the intersection (overlapping range) of two given {@link TimeInterval}s, returning `null` if there
 * isn't any.
 *
 * @param {TimeInterval} left
 * @param {TimeInterval} right
 */
export const intervalIntersectionWithInterval = <
  LeftInterval extends TimeInterval = TimeInterval,
  RightInterval extends TimeInterval = TimeInterval,
>(
  left: LeftInterval,
  right: RightInterval,
): IntersectionReturn<LeftInterval, RightInterval> | null => {
  /*
   Examples     |     1     |     2
   =============|===========|===========
   Interval A   |   [-----] | [-----]
   Interval B   | [-----]   |   [-----]
   -------------|-----------|-----------
   Intersection |   [---]   |   [---]
   */
  if (!intervalOverlapsInterval(left, right)) {
    return null;
  } else {
    return {
      start:
        compareBounds(left.start, right.start, "start", "start") <= 0
          ? right.start
          : left.start,
      end:
        compareBounds(left.end, right.end, "end", "end") <= 0
          ? left.end
          : right.end,
    } as IntersectionReturn<LeftInterval, RightInterval>;
  }
};

/**
 * Advanced type to provide stronger type information when using {@link intervalMergeWithInterval}.
 *
 * If *both* of the `start` {@link TemporalBound}s are bounded, then the resultant `start` {@link TemporalBound} will be
 * bounded, same goes for end respectively
 */
type MergeReturn<
  LeftInterval extends TimeInterval,
  RightInterval extends TimeInterval,
> = [LeftInterval, RightInterval] extends [
  TimeInterval<infer LeftStartBound, infer LeftEndBound>,
  TimeInterval<infer RightStartBound, infer RightEndBound>,
]
  ? TimeInterval<
      LeftStartBound extends LimitedTemporalBound
        ? RightStartBound extends LimitedTemporalBound
          ? LimitedTemporalBound
          : TemporalBound
        : TemporalBound,
      LeftEndBound extends LimitedTemporalBound
        ? RightEndBound extends LimitedTemporalBound
          ? LimitedTemporalBound
          : TemporalBound
        : TemporalBound
    >
  : never;

/**
 * Returns the {@link TimeInterval} which fully spans the space between the `start` {@link TemporalBound}s and
 * end {@link TemporalBound}s of two provided {@link TimeInterval}s.
 *
 * If the intervals do not overlap and are not adjacent, the resultant interval will span _more_ space than that spanned
 * by the given intervals. _This is different behavior compared to {@link intervalUnionWithInterval}._
 *
 * @param {TimeInterval} left
 * @param {TimeInterval} right
 */
export const intervalMergeWithInterval = <
  LeftInterval extends TimeInterval = TimeInterval,
  RightInterval extends TimeInterval = TimeInterval,
>(
  left: LeftInterval,
  right: RightInterval,
): MergeReturn<LeftInterval, RightInterval> => {
  /*
   Examples   |      1      |      2      |       3       |        4        |      5
   ===========|=============|=============|===============|=================|=============
   Interval A |    [-----]  |  [-----]    | [---]         |         [-----] | [---------]
   Interval B |  [-----]    |    [-----]  |         [---) | (-----]         |   [-----]
   -----------|-------------|-------------|---------------|-----------------|-------------
   Merge      |  [-------]  |  [-------]  | [-----------) | (-------------] | [---------]
   */
  return {
    start:
      compareBounds(left.start, right.start, "start", "start") <= 0
        ? left.start
        : right.start,
    end:
      compareBounds(left.end, right.end, "end", "end") >= 0
        ? left.end
        : right.end,
  } as MergeReturn<LeftInterval, RightInterval>;
};

type UnionReturn<
  LeftInterval extends TimeInterval,
  RightInterval extends TimeInterval,
> =
  | [MergeReturn<LeftInterval, RightInterval>]
  | [LeftInterval, RightInterval]
  | [RightInterval, LeftInterval];

/**
 * Given two {@link TimeInterval}s, this returns a list of non-adjacent, non-overlapping
 * {@link TimeInterval}s which span the space spanned by the input intervals.
 *
 * In other words, if the intervals _are_ adjacent, or overlap, then this returns the result of calling
 * {@link intervalMergeWithInterval} on the intervals, otherwise it returns the two intervals back.
 *
 * @param {TimeInterval}  left
 * @param {TimeInterval}  right
 */
export const intervalUnionWithInterval = <
  LeftInterval extends TimeInterval = TimeInterval,
  RightInterval extends TimeInterval = TimeInterval,
>(
  left: LeftInterval,
  right: RightInterval,
): UnionReturn<LeftInterval, RightInterval> => {
  /*
   Examples   |      1      |      2      |       3       |        4        |      5
   ===========|=============|=============|===============|=================|=============
   Interval A |    [-----]  |  [-----]    | [---]         |         [-----] | [---------]
   Interval B |  [-----]    |    [-----]  |         [---) | (-----]         |   [-----]
   -----------|-------------|-------------|---------------|-----------------|-------------
   Union      |  [-------]  |  [-------]  | [---]   [---) | (-----] [-----] | [---------]
   */
  if (
    intervalOverlapsInterval(left, right) ||
    intervalIsAdjacentToInterval(left, right)
  ) {
    return [intervalMergeWithInterval(left, right)];
  } else if (compareBounds(left.start, right.start, "start", "start") < 0) {
    return [left, right];
  } else {
    return [right, left];
  }
};

/**
 * Given a collection of {@link TimeInterval}s, this returns a list of non-adjacent, non-overlapping
 * {@link TimeInterval}'s which span the space spanned by the input intervals.
 *
 * Conceptually this recursively calls {@link intervalUnionWithInterval} pairwise until all intervals have been unioned
 * with one another. The space spanned by the result will not necessarily be contiguous (may contain gaps).
 *
 * @param {TimeInterval[]} intervals
 */
export const unionOfIntervals = <IntervalsType extends TimeInterval>(
  ...intervals: IntervalsType[]
): UnionReturn<IntervalsType, IntervalsType>[number][] => {
  /*
   Examples   |       1       |       2       |       3
   ===========|===============|===============|===============
   Interval A | [--]          | (--]          | [--]
   Interval B |      [-]      |      [-)      |      [-)
   Interval C |  [--]         |  [--]         |  [---]
   Interval D |           [-] |           [-] |        [----]
   -----------|---------------|---------------|---------------
   Union      | [------]  [-] | (------)  [-] | [-----------]
   */
  sortIntervals(intervals);

  return intervals.reduce(
    (union, currentInterval) => {
      if (union.length === 0) {
        return [currentInterval];
      } else {
        // The intervals were sorted above, it's only necessary to check the union of this with the last interval, if it
        // overlaps two of the previous ones (which would make it necessary to check the union with more than just the
        // last) then those would have been merged into one in the previous iteration (again because they are sorted).
        return [
          ...union.slice(0, -1),
          ...intervalUnionWithInterval(union.at(-1)!, currentInterval),
        ];
      }
    },
    [] as UnionReturn<IntervalsType, IntervalsType>[number][],
  );
};

/**
 * Given two {@link TimeInterval}s, `left` and `right`, this returns `true` if the `left` interval spans a time
 * range that is completely *before* the time range spanned by the `right` interval (which also implies they do not
 * overlap), and false otherwise.
 *
 * @param {TimeInterval} left
 * @param {TimeInterval} right
 */
export const intervalIsStrictlyBeforeInterval = (
  left: TimeInterval,
  right: TimeInterval,
): boolean => {
  return compareBounds(left.end, right.start, "end", "start") < 0;
};

/**
 * Given two {@link TimeInterval}s, `left` and `right`, this returns `true` if the `left` interval spans a time
 * range that is completely *after* the time range spanned by the `right` interval (which also implies they do not
 * overlap), and false otherwise.
 *
 * @param {TimeInterval} left
 * @param {TimeInterval} right
 */
export const intervalIsStrictlyAfterInterval = (
  left: TimeInterval,
  right: TimeInterval,
): boolean => {
  return compareBounds(left.start, right.end, "start", "end") > 0;
};
