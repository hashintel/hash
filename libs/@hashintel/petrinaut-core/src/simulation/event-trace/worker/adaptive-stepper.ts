/* eslint-disable no-param-reassign -- Monte Carlo run state and frame buffers are mutable by design. */
import { getPlaceDynamicsEquationIds } from "../../../place-dynamics";
import { getOwn } from "../../../validation/record-keys";
import { nextRandom } from "../../engine/seeded-rng";
import { copyMonteCarloFrameBuffer } from "../../monte-carlo/frame-buffer";
import {
  applyTokenAdditions,
  applyTokenRemovals,
  hasStructurallyEnabledTransition,
  mergeTokenAdditions,
} from "../../monte-carlo/frame-operations";
import {
  createRunState,
  ensureFrameCapacity,
} from "../../monte-carlo/run-state";
import { classifyDynamics } from "../solver/classify-dynamics";
import {
  createPlaceIntegrator,
  realFieldNames,
} from "../solver/place-integrators";
import { SOLVER_ERROR_DIAGNOSTIC } from "../trace";
import { positiveNumberParameter } from "./run-stepper";
import { computeFiringEffect, evaluateHazards } from "./transition-hazards";

import type { SimulationCompletionReason } from "../../engine/compute-next-frame";
import type { MonteCarloFrameBuffer } from "../../monte-carlo/frame-buffer";
import type {
  MonteCarloRunState,
  PlaceID,
} from "../../monte-carlo/internal-types";
import type { DynamicsClass } from "../solver/classify-dynamics";
import type { PlaceIntegrator } from "../solver/place-integrators";
import type {
  RunAdvance,
  RunStepper,
  RunStepperConfig,
  StepperParameters,
} from "./run-stepper";
import type { FiringMode } from "./transition-hazards";

export const ADAPTIVE_SIMULATOR_ID = "js-adaptive";

/**
 * Simulated seconds the adaptive stepper lets pass without a firing before
 * it asks for the state to be kept, and the longest span it holds a rate
 * for. Its own policy: no caller sets it.
 */
const REFERENCE_INTERVAL = 0.1;

export type AdaptiveStepperParameters = {
  /**
   * The local error allowed per integration step, as a fraction of an
   * attribute's magnitude and in absolute terms near zero.
   */
  tolerance: number;
};

export const readAdaptiveStepperParameters = (
  parameters: StepperParameters,
): AdaptiveStepperParameters => ({
  tolerance: positiveNumberParameter(
    ADAPTIVE_SIMULATOR_ID,
    parameters,
    "tolerance",
  ),
});

export interface AdaptiveStepper extends RunStepper {
  /** How each place with dynamics advances, by place id. */
  readonly dynamicsKinds: ReadonlyMap<string, DynamicsClass["kind"]>;
}

/** Firings at one instant before the run is declared stuck. */
const ZERO_TIME_FIRING_LIMIT = 10_000;
/** Bisection steps locating the instant a predicate starts to hold. */
const CROSSING_ITERATIONS = 48;

/**
 * HIR artifacts are keyed by the net's item ids, while a flattened component
 * instance's item is `instancePath::originalId`.
 */
const sourceItemId = (id: string): string => {
  const separator = id.lastIndexOf("::");
  return separator === -1 ? id : id.slice(separator + 2);
};

type PlaceDynamics = {
  placeIndex: number;
  integrator: PlaceIntegrator;
};

/**
 * Steps a single run as a piecewise-deterministic process: between events
 * every place's continuous state is integrated by an error-controlled solver
 * over a span of at most `REFERENCE_INTERVAL`, and firings are sampled from
 * the transitions' rates at the start of the span. Each advance ends at a
 * firing, at the end of the span, or at the time the caller stops it at;
 * the first two are states worth keeping, published with the solver's
 * accumulated error per place.
 *
 * Rates are held at their value from the start of the span, which is exact
 * for rates that read no continuous attribute. A predicate that starts to
 * hold inside the span fires at the instant it does, located by bisection;
 * one that holds at the start of a step fires at once. Every token
 * combination is a firing mode of its own, so a transition's rate is the
 * sum over its combinations and the firing combination is drawn in
 * proportion.
 */
export function createAdaptiveStepper(
  config: RunStepperConfig,
  { tolerance }: AdaptiveStepperParameters,
): AdaptiveStepper {
  const referenceInterval = REFERENCE_INTERVAL;
  const maxTime = config.maxTime;
  const run: MonteCarloRunState = createRunState(
    {
      sdcpn: config.sdcpn,
      ...(config.extensions === undefined
        ? {}
        : { extensions: config.extensions }),
      ...(config.hirArtifacts === undefined
        ? {}
        : { hirArtifacts: config.hirArtifacts }),
      runCount: 1,
      initialMarking: config.initialMarking,
      parameterValues: config.parameterValues,
      seed: config.seed,
      dt: referenceInterval,
      maxTime: maxTime ?? Number.POSITIVE_INFINITY,
    },
    config.runConfig,
    config.runIndex ?? 0,
  );
  const { simulation } = run;
  const layout = simulation.frameLayout;

  const dynamicsKinds = new Map<string, DynamicsClass["kind"]>();
  const places: PlaceDynamics[] = [];
  for (const [placeId, equation] of simulation.differentialEquationFns) {
    const placeIndex = layout.placeIndexById.get(placeId);
    const tokenLayout =
      placeIndex === undefined
        ? undefined
        : layout.placeTokenLayouts[placeIndex];
    if (placeIndex === undefined || !tokenLayout) {
      continue;
    }
    const place = simulation.places.get(placeId);
    const terms = place
      ? getPlaceDynamicsEquationIds(place).map((equationId) => {
          const artifact = getOwn(
            config.hirArtifacts?.dynamics,
            sourceItemId(equationId),
          );
          return { hir: artifact?.hir, arity: artifact?.arity ?? 1 };
        })
      : [];
    let dynamics = classifyDynamics(terms, realFieldNames(tokenLayout));
    // A component instance's places may bind parameter values of their own,
    // which the run does not expose, so their coefficients cannot be fixed.
    if (dynamics.kind === "affine" && placeId.includes("::")) {
      dynamics = { kind: "independent" };
    }
    dynamicsKinds.set(placeId, dynamics.kind);
    places.push({
      placeIndex,
      integrator: createPlaceIntegrator({
        equation,
        layout: tokenLayout,
        dynamics,
        parameters: simulation.parameterValues,
        tolerance,
      }),
    });
  }

  const errorByPlace = new Float64Array(layout.placeIds.length);
  const stepErrors = new Float64Array(layout.placeIds.length);
  const trialErrors = new Float64Array(layout.placeIds.length);
  let time = 0;
  /**
   * Time of the last firing, and the whole reference spans since: a
   * reference event's time is the anchor plus a multiple of the interval,
   * so a stretch of them lands on the grid instead of drifting by rounding.
   */
  let anchorTime = 0;
  let spansSinceAnchor = 0;
  /**
   * Simulated time already covered of the current reference span by
   * advances a caller stopped short. Zero while the run sits on the grid.
   */
  let intoSpan = 0;
  let zeroTimeFirings = 0;
  let completion: SimulationCompletionReason | null = null;
  let error: string | null = null;

  /** The next-frame buffer holding a copy of the current frame. */
  const prepareWorking = (): MonteCarloFrameBuffer => {
    const source = run.currentFrame;
    const target = ensureFrameCapacity(
      run,
      run.nextFrame,
      source.tokenByteCount,
    );
    copyMonteCarloFrameBuffer(source, target);
    return target;
  };

  /** Advances the continuous state of `frame` by `span` in place; `errors` takes each place's error. */
  const integrateFrame = (
    frame: MonteCarloFrameBuffer,
    span: number,
    errors: Float64Array,
  ): void => {
    errors.fill(0);
    for (const { placeIndex, integrator } of places) {
      const count = frame.placeCounts[placeIndex] ?? 0;
      const stride = layout.placeStrideBytes[placeIndex] ?? 0;
      if (count === 0 || stride === 0) {
        continue;
      }
      const offset = frame.placeOffsets[placeIndex] ?? 0;
      // `.slice` copies into a fresh, 8-aligned buffer the equation can read.
      const bytes = frame.tokenBytes.slice(offset, offset + count * stride);
      errors[placeIndex] = integrator.integrate(bytes, count, span);
      frame.tokenBytes.set(bytes, offset);
    }
  };

  const accumulateErrors = (): void => {
    for (let index = 0; index < errorByPlace.length; index++) {
      errorByPlace[index] = errorByPlace[index]! + stepErrors[index]!;
    }
  };

  const advanceTimers = (
    frame: MonteCarloFrameBuffer,
    firedTransitionId: string | null,
    elapsed: number,
  ): void => {
    for (const [index, transitionId] of layout.transitionIds.entries()) {
      if (transitionId === firedTransitionId) {
        frame.transitionElapsedFrames[index] = 0;
        frame.transitionElapsed[index] = 0;
        frame.transitionFiredFlags[index] = 1;
        frame.transitionFiringCounts[index] =
          (frame.transitionFiringCounts[index] ?? 0) + 1;
      } else {
        frame.transitionElapsedFrames[index] =
          (frame.transitionElapsedFrames[index] ?? 0) + 1;
        frame.transitionElapsed[index] =
          (frame.transitionElapsed[index] ?? 0) + elapsed;
        frame.transitionFiredFlags[index] = 0;
      }
    }
  };

  const fire = (
    working: MonteCarloFrameBuffer,
    mode: FiringMode,
  ): MonteCarloFrameBuffer => {
    const effect = computeFiringEffect(run, working, mode, run.rngState);
    run.rngState = effect.newRngState;
    applyTokenRemovals(layout, working, effect.remove);
    const additions = new Map<PlaceID, Uint8Array[]>();
    mergeTokenAdditions(additions, effect.add);
    return applyTokenAdditions(run, working, additions);
  };

  const commit = (working: MonteCarloFrameBuffer): void => {
    run.nextFrame = run.currentFrame;
    run.currentFrame = working;
  };

  const complete = (reason: SimulationCompletionReason): RunAdvance => {
    completion = reason;
    run.status = "complete";
    run.completionReason = reason;
    return {
      time,
      kind: "stopped",
      firedTransitionIds: [],
      completion,
      error: null,
    };
  };

  const firingResult = (
    working: MonteCarloFrameBuffer,
    mode: FiringMode,
    elapsed: number,
  ): RunAdvance => {
    const fired = fire(working, mode);
    advanceTimers(fired, mode.transition.id, elapsed);
    commit(fired);
    time += elapsed;
    anchorTime = time;
    spansSinceAnchor = 0;
    intoSpan = 0;
    return {
      time,
      kind: "firing",
      firedTransitionIds: [mode.transition.id],
      completion: null,
      error: null,
    };
  };

  /**
   * The earliest instant in `(0, span]` at which a predicate holds, given
   * that none holds at 0 and one does at `span`, to within the bisection's
   * resolution.
   */
  const findCrossing = (span: number): number => {
    let low = 0;
    let high = span;
    for (
      let iteration = 0;
      iteration < CROSSING_ITERATIONS && high - low > span * 1e-12;
      iteration++
    ) {
      const mid = (low + high) / 2;
      const trial = prepareWorking();
      integrateFrame(trial, mid, trialErrors);
      if (evaluateHazards(run, trial).immediate) {
        high = mid;
      } else {
        low = mid;
      }
    }
    return high;
  };

  const advance = (stopAt: number): RunAdvance => {
    run.status = "running";
    const remaining =
      maxTime === null ? Number.POSITIVE_INFINITY : maxTime - time;
    if (remaining <= 0) {
      return complete("maxTime");
    }

    const hazards = evaluateHazards(run, run.currentFrame);
    if (hazards.immediate) {
      zeroTimeFirings += 1;
      if (zeroTimeFirings > ZERO_TIME_FIRING_LIMIT) {
        throw new Error(
          `Transition \`${hazards.immediate.transition.name}\` fired ${ZERO_TIME_FIRING_LIMIT} times at time ${time} without time advancing: an immediate transition that never disables`,
        );
      }
      return firingResult(prepareWorking(), hazards.immediate, 0);
    }
    zeroTimeFirings = 0;

    if (hazards.modes.length === 0 && !hasStructurallyEnabledTransition(run)) {
      return complete("deadlock");
    }

    // A firing at the stop itself has happened by now, so the state a
    // caller sees there is the one after it.
    const toStop = stopAt - time;
    if (toStop <= 0) {
      return {
        time,
        kind: "stopped",
        firedTransitionIds: [],
        completion: null,
        error: null,
      };
    }

    const toReference = referenceInterval - intoSpan;
    const span = Math.min(toReference, remaining, toStop);
    let waiting = Number.POSITIVE_INFINITY;
    if (hazards.total > 0) {
      const [uniform, nextState] = nextRandom(run.rngState);
      run.rngState = nextState;
      waiting = -Math.log(1 - uniform) / hazards.total;
    }
    const stepSpan = Math.min(waiting, span);

    let working = prepareWorking();
    integrateFrame(working, stepSpan, stepErrors);

    // A predicate that starts to hold during the span fires when it does,
    // ahead of whatever the rates drew; the draw is memoryless, so it is
    // simply made again from the new state.
    if (evaluateHazards(run, working).immediate) {
      const crossing = findCrossing(stepSpan);
      working = prepareWorking();
      integrateFrame(working, crossing, stepErrors);
      const mode = evaluateHazards(run, working).immediate;
      if (mode) {
        accumulateErrors();
        return firingResult(working, mode, crossing);
      }
      // The bisection's resolution did not separate the crossing from the
      // end of the span: the next step fires it at the start.
      working = prepareWorking();
      integrateFrame(working, stepSpan, stepErrors);
    }
    accumulateErrors();

    if (waiting <= span) {
      const [uniform, nextState] = nextRandom(run.rngState);
      run.rngState = nextState;
      let threshold = uniform * hazards.total;
      let chosen = hazards.modes[hazards.modes.length - 1]!;
      for (const mode of hazards.modes) {
        threshold -= mode.rate;
        if (threshold < 0) {
          chosen = mode;
          break;
        }
      }
      return firingResult(working, chosen, waiting);
    }

    advanceTimers(working, null, span);
    commit(working);
    const isFinal = maxTime !== null && span >= remaining;
    if (!isFinal && span < toReference) {
      // Stopped short of the span's end: nothing to keep, and the rest of
      // the span is the next advance's.
      intoSpan += span;
      time = stopAt;
      return {
        time,
        kind: "stopped",
        firedTransitionIds: [],
        completion: null,
        error: null,
      };
    }

    spansSinceAnchor += 1;
    intoSpan = 0;
    time = isFinal
      ? maxTime
      : anchorTime + spansSinceAnchor * referenceInterval;
    if (isFinal) {
      completion = "maxTime";
      run.status = "complete";
      run.completionReason = "maxTime";
    }
    return {
      time,
      kind: "reference",
      firedTransitionIds: [],
      completion,
      error: null,
    };
  };

  return {
    run,
    dynamicsKinds,
    get time() {
      return time;
    },
    advance(stopAt = Number.POSITIVE_INFINITY) {
      if (completion !== null || error !== null) {
        return {
          time,
          kind: "stopped",
          firedTransitionIds: [],
          completion,
          error,
        };
      }
      try {
        return advance(stopAt);
      } catch (caught) {
        run.status = "error";
        error = caught instanceof Error ? caught.message : String(caught);
        run.error = error;
        return {
          time,
          kind: "stopped",
          firedTransitionIds: [],
          completion: null,
          error,
        };
      }
    },
    diagnostics: () => ({
      [SOLVER_ERROR_DIAGNOSTIC]: Float64Array.from(errorByPlace),
    }),
  };
}
