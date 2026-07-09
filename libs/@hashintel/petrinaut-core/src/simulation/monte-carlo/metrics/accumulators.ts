import type {
  MonteCarloMetricDistributionBinning,
  MonteCarloUserDefinedMetricAggregation,
  MonteCarloUserDefinedMetricDistributionBin,
} from "./types";

export type MonteCarloMetricMonoid<State> = {
  empty: () => State;
  merge: (left: State, right: State) => State;
};

export type MonteCarloMetricValueAccumulator<Input, State, Output> =
  MonteCarloMetricMonoid<State> & {
    add: (state: State, input: Input) => State;
    read: (state: State) => Output;
  };

export type MonteCarloMetricNumericAccumulatorState = {
  count: number;
  sum: number;
  min: number | null;
  max: number | null;
  last: number | null;
};

export type MonteCarloMetricHistogramAccumulatorState = ReadonlyMap<
  number,
  number
>;

function getDistributionBinValue(
  value: number,
  binning: MonteCarloMetricDistributionBinning | undefined,
): number {
  if (!binning || binning === "exact") {
    return value;
  }

  if (!Number.isFinite(binning.width) || binning.width <= 0) {
    throw new Error("Distribution bin width must be a positive finite number.");
  }

  return Math.floor(value / binning.width) * binning.width;
}

export function createMonteCarloMetricNumericAccumulator(
  method: MonteCarloUserDefinedMetricAggregation,
): MonteCarloMetricValueAccumulator<
  number,
  MonteCarloMetricNumericAccumulatorState,
  number | null
> {
  return {
    empty: () => ({
      count: 0,
      sum: 0,
      min: null,
      max: null,
      last: null,
    }),
    add: (state, input) => ({
      count: state.count + 1,
      sum: state.sum + input,
      min: state.min === null ? input : Math.min(state.min, input),
      max: state.max === null ? input : Math.max(state.max, input),
      last: input,
    }),
    merge: (left, right) => ({
      count: left.count + right.count,
      sum: left.sum + right.sum,
      min:
        left.min === null
          ? right.min
          : right.min === null
            ? left.min
            : Math.min(left.min, right.min),
      max:
        left.max === null
          ? right.max
          : right.max === null
            ? left.max
            : Math.max(left.max, right.max),
      last: right.count > 0 ? right.last : left.last,
    }),
    read: (state) => {
      if (state.count === 0) {
        return null;
      }

      switch (method) {
        case "mean":
          return state.sum / state.count;
        case "sum":
          return state.sum;
        case "min":
          return state.min;
        case "max":
          return state.max;
        case "last":
          return state.last;
      }
    },
  };
}

export function createMonteCarloMetricHistogramAccumulator(
  binning?: MonteCarloMetricDistributionBinning,
): MonteCarloMetricValueAccumulator<
  number,
  MonteCarloMetricHistogramAccumulatorState,
  MonteCarloUserDefinedMetricDistributionBin[]
> {
  return {
    empty: () => new Map(),
    add: (state, input) => {
      const binValue = getDistributionBinValue(input, binning);
      const next = new Map(state);
      next.set(binValue, (next.get(binValue) ?? 0) + 1);
      return next;
    },
    merge: (left, right) => {
      const next = new Map(left);

      for (const [value, frequency] of right) {
        next.set(value, (next.get(value) ?? 0) + frequency);
      }

      return next;
    },
    read: (state) =>
      [...state.entries()]
        .sort(([left], [right]) => left - right)
        .map(([value, frequency]) => [value, frequency]),
  };
}

export function addAllMonteCarloMetricValues<Input, State, Output>(
  accumulator: MonteCarloMetricValueAccumulator<Input, State, Output>,
  inputs: readonly Input[],
): State {
  let state = accumulator.empty();

  for (const input of inputs) {
    state = accumulator.add(state, input);
  }

  return state;
}
