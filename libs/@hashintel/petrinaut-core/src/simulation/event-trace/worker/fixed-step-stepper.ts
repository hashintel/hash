import { advanceRun } from "../../monte-carlo/advance-run";
import { createRunState } from "../../monte-carlo/run-state";
import { getFrameTime } from "../../monte-carlo/time";
import { firedTransitionIds, positiveNumberParameter } from "./run-stepper";

import type {
  RunAdvance,
  RunStepper,
  RunStepperConfig,
  StepperParameters,
} from "./run-stepper";

export const FIXED_STEP_SIMULATOR_ID = "js-fixed-step";

/**
 * Simulated seconds the fixed-step stepper lets pass without a firing before
 * it asks for the state to be kept. Its own policy: no caller sets it.
 */
const REFERENCE_INTERVAL = 0.1;

export type FixedStepStepperParameters = {
  /** Simulated seconds per step. */
  dt: number;
};

export const readFixedStepStepperParameters = (
  parameters: StepperParameters,
): FixedStepStepperParameters => ({
  dt: positiveNumberParameter(FIXED_STEP_SIMULATOR_ID, parameters, "dt"),
});

/**
 * Steps one run of the fixed-step engine, the loop experiments run, and
 * stops where something is worth keeping: a step with at least one firing,
 * a step that ends a stretch of `REFERENCE_INTERVAL` without one, and the
 * run's last state.
 *
 * The run is one run of a Monte Carlo experiment, so it keeps two frame
 * buffers whatever the step count, and its seed derives from `seed` and its
 * index as that experiment's run would.
 */
export function createFixedStepStepper(
  config: RunStepperConfig,
  { dt }: FixedStepStepperParameters,
): RunStepper {
  const run = createRunState(
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
      dt,
      maxTime: config.maxTime ?? Number.POSITIVE_INFINITY,
    },
    config.runConfig,
    config.runIndex ?? 0,
  );
  const stepsPerReference = Math.max(1, Math.round(REFERENCE_INTERVAL / dt));
  /** The step whose state was last handed back as worth keeping. */
  let lastKeptStep = 0;

  const time = () => getFrameTime(run.frameNumber, dt);
  const stopped = (
    kind: RunAdvance["kind"],
    fired: readonly string[],
  ): RunAdvance => {
    if (kind !== "stopped") {
      lastKeptStep = run.frameNumber;
    }
    return {
      time: time(),
      kind,
      firedTransitionIds: fired,
      completion: run.completionReason,
      error: run.error,
    };
  };

  return {
    run,
    get time() {
      return time();
    },
    advance(stopAt = Number.POSITIVE_INFINITY) {
      // A sliver of slack, so a stop on a multiple of `dt` is reached
      // whatever the rounding of the product.
      while (getFrameTime(run.frameNumber + 1, dt) <= stopAt + dt * 1e-6) {
        if (!advanceRun(run)) {
          // The run was already over, or the step failed: there is no new
          // state. The step that ended the run handed its state back.
          return stopped("stopped", []);
        }
        const fired = firedTransitionIds(run);
        if (fired.length > 0) {
          return stopped("firing", fired);
        }
        if (
          run.frameNumber - lastKeptStep >= stepsPerReference ||
          run.completionReason !== null
        ) {
          return stopped("reference", []);
        }
      }
      return stopped("stopped", []);
    },
  };
}
