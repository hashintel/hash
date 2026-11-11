/**
 * Writes the time derivative of `state` into `derivative`. Both vectors have
 * the integrator's dimension; the function reads one and overwrites the
 * other.
 */
export type OdeDerivative = (
  state: Float64Array,
  derivative: Float64Array,
) => void;

export type Rk45Tolerance = {
  /** Local error allowed per step where the state is near zero, in state units. */
  absolute: number;
  /** Local error allowed per step, as a fraction of the state's magnitude. */
  relative: number;
};

export type Rk45Outcome = {
  /**
   * Sum over the accepted steps of the step's local error estimate, taken as
   * the largest error of any component, in state units.
   */
  accumulatedError: number;
  acceptedSteps: number;
  rejectedSteps: number;
  /**
   * Steps accepted at the smallest step size the integrator allows, their
   * error estimate still above the tolerance. A discontinuity in the
   * derivative does this; the error is counted in `accumulatedError`.
   */
  forcedSteps: number;
  /** The step size the control settled on, to start the next integration from. */
  nextStep: number;
};

export type Rk45Integrator = {
  readonly dimension: number;
  /**
   * Advances `state` by `span` in place and reports the error incurred.
   * `initialStep` seeds the step-size control; the integrator shrinks or
   * grows it from the first error estimate.
   */
  integrate(
    derivative: OdeDerivative,
    state: Float64Array,
    span: number,
    tolerance: Rk45Tolerance,
    initialStep?: number,
  ): Rk45Outcome;
};

// Dormand–Prince 5(4) tableau. The seventh stage is the derivative at the
// accepted state, so it serves as the first stage of the next step.
const A21 = 1 / 5;
const A31 = 3 / 40;
const A32 = 9 / 40;
const A41 = 44 / 45;
const A42 = -56 / 15;
const A43 = 32 / 9;
const A51 = 19372 / 6561;
const A52 = -25360 / 2187;
const A53 = 64448 / 6561;
const A54 = -212 / 729;
const A61 = 9017 / 3168;
const A62 = -355 / 33;
const A63 = 46732 / 5247;
const A64 = 49 / 176;
const A65 = -5103 / 18656;
const B1 = 35 / 384;
const B3 = 500 / 1113;
const B4 = 125 / 192;
const B5 = -2187 / 6784;
const B6 = 11 / 84;
// Difference between the fifth-order and the embedded fourth-order weights.
const E1 = 71 / 57600;
const E3 = -71 / 16695;
const E4 = 71 / 1920;
const E5 = -17253 / 339200;
const E6 = 22 / 525;
const E7 = -1 / 40;

const SAFETY = 0.9;
const MIN_SHRINK = 0.2;
const MAX_GROWTH = 5;
/** Smallest step relative to the span; below it a step is accepted as is. */
const MIN_STEP_FRACTION = 1e-13;
const MAX_STEPS = 1_000_000;

const maxAbs = (vector: Float64Array): number => {
  let largest = 0;
  for (let index = 0; index < vector.length; index++) {
    const magnitude = Math.abs(vector[index]!);
    if (magnitude > largest) {
      largest = magnitude;
    }
  }
  return largest;
};

/**
 * Dormand–Prince 5(4) with proportional step-size control over a flat state
 * vector. The workspace is allocated once for the dimension and reused by
 * every `integrate` call, so a caller integrating many small systems keeps
 * one integrator per dimension.
 */
export function createRk45Integrator(dimension: number): Rk45Integrator {
  const k1 = new Float64Array(dimension);
  const k2 = new Float64Array(dimension);
  const k3 = new Float64Array(dimension);
  const k4 = new Float64Array(dimension);
  const k5 = new Float64Array(dimension);
  const k6 = new Float64Array(dimension);
  const k7 = new Float64Array(dimension);
  const candidate = new Float64Array(dimension);
  const stage = new Float64Array(dimension);
  const error = new Float64Array(dimension);

  const initialStepGuess = (
    state: Float64Array,
    span: number,
    tolerance: Rk45Tolerance,
  ): number => {
    // Hairer's starting-step heuristic from the scaled norms of the state
    // and its derivative, capped by the span.
    let stateNorm = 0;
    let slopeNorm = 0;
    for (let index = 0; index < dimension; index++) {
      const scale =
        tolerance.absolute + tolerance.relative * Math.abs(state[index]!);
      stateNorm = Math.max(stateNorm, Math.abs(state[index]!) / scale);
      slopeNorm = Math.max(slopeNorm, Math.abs(k1[index]!) / scale);
    }
    const guess =
      stateNorm < 1e-5 || slopeNorm < 1e-5
        ? 1e-6
        : 0.01 * (stateNorm / slopeNorm);
    return Math.min(span, guess);
  };

  return {
    dimension,
    integrate(derivative, state, span, tolerance, initialStep) {
      if (state.length !== dimension) {
        throw new Error(
          `RK45 integrator of dimension ${dimension} given a state of length ${state.length}`,
        );
      }
      const outcome: Rk45Outcome = {
        accumulatedError: 0,
        acceptedSteps: 0,
        rejectedSteps: 0,
        forcedSteps: 0,
        nextStep: initialStep ?? span,
      };
      if (span <= 0 || dimension === 0) {
        return outcome;
      }

      derivative(state, k1);
      let step = Math.min(
        span,
        initialStep ?? initialStepGuess(state, span, tolerance),
      );
      const minStep = span * MIN_STEP_FRACTION;
      let elapsed = 0;

      for (let count = 0; count < MAX_STEPS; count++) {
        const remaining = span - elapsed;
        if (remaining <= 0) {
          break;
        }
        const isLast = step >= remaining * (1 - 1e-12);
        const stepSize = isLast ? remaining : step;

        for (let index = 0; index < dimension; index++) {
          stage[index] = state[index]! + stepSize * A21 * k1[index]!;
        }
        derivative(stage, k2);
        for (let index = 0; index < dimension; index++) {
          stage[index] =
            state[index]! + stepSize * (A31 * k1[index]! + A32 * k2[index]!);
        }
        derivative(stage, k3);
        for (let index = 0; index < dimension; index++) {
          stage[index] =
            state[index]! +
            stepSize * (A41 * k1[index]! + A42 * k2[index]! + A43 * k3[index]!);
        }
        derivative(stage, k4);
        for (let index = 0; index < dimension; index++) {
          stage[index] =
            state[index]! +
            stepSize *
              (A51 * k1[index]! +
                A52 * k2[index]! +
                A53 * k3[index]! +
                A54 * k4[index]!);
        }
        derivative(stage, k5);
        for (let index = 0; index < dimension; index++) {
          stage[index] =
            state[index]! +
            stepSize *
              (A61 * k1[index]! +
                A62 * k2[index]! +
                A63 * k3[index]! +
                A64 * k4[index]! +
                A65 * k5[index]!);
        }
        derivative(stage, k6);
        for (let index = 0; index < dimension; index++) {
          candidate[index] =
            state[index]! +
            stepSize *
              (B1 * k1[index]! +
                B3 * k3[index]! +
                B4 * k4[index]! +
                B5 * k5[index]! +
                B6 * k6[index]!);
        }
        derivative(candidate, k7);

        let errorRatio = 0;
        for (let index = 0; index < dimension; index++) {
          error[index] =
            stepSize *
            (E1 * k1[index]! +
              E3 * k3[index]! +
              E4 * k4[index]! +
              E5 * k5[index]! +
              E6 * k6[index]! +
              E7 * k7[index]!);
          const scale =
            tolerance.absolute +
            tolerance.relative *
              Math.max(Math.abs(state[index]!), Math.abs(candidate[index]!));
          errorRatio = Math.max(errorRatio, Math.abs(error[index]!) / scale);
        }

        if (!Number.isFinite(errorRatio)) {
          // No smaller step repairs a derivative that is not a number.
          throw new Error(
            "The dynamics produced a value that is not a finite number",
          );
        }

        const forced = errorRatio > 1 && stepSize <= minStep;
        if (errorRatio <= 1 || forced) {
          state.set(candidate);
          k1.set(k7);
          elapsed = isLast ? span : elapsed + stepSize;
          outcome.acceptedSteps += 1;
          outcome.accumulatedError += maxAbs(error);
          if (forced) {
            outcome.forcedSteps += 1;
          }
          const growth =
            errorRatio === 0
              ? MAX_GROWTH
              : Math.min(
                  MAX_GROWTH,
                  Math.max(MIN_SHRINK, SAFETY * errorRatio ** -0.2),
                );
          // A last step is cut to what is left of the span. The next span
          // starts from the step the solver wanted, not from the cut.
          step = isLast ? Math.max(step, stepSize * growth) : stepSize * growth;
        } else {
          outcome.rejectedSteps += 1;
          step = Math.max(
            minStep,
            stepSize * Math.max(0.1, SAFETY * errorRatio ** -0.2),
          );
        }
      }

      if (elapsed < span) {
        throw new Error(
          `The solver did not cover ${span} s of simulated time in ${MAX_STEPS} steps`,
        );
      }
      outcome.nextStep = step;
      return outcome;
    },
  };
}
