import { advanceRun } from "../../monte-carlo/advance-run";
import { createStepperRunState, firedTransitionIds } from "./run-stepper";

import type { RunAdvance, RunStepper, RunStepperConfig } from "./run-stepper";

/**
 * Steps one run of an untimed net: every transition is a predicate and no
 * place has dynamics, so nothing in the net takes time.
 *
 * A step gives every transition one turn, in net order, and a transition
 * that is enabled on its turn fires once. The tokens it consumes leave at
 * once, and the tokens the step produces arrive together at its end. This
 * is the step of the fixed-step engine without the span of time that
 * engine gives it.
 *
 * The run's position is the number of steps taken: `time` counts steps
 * here, and `maxTime` is the step the run stops at.
 *
 * A step that fires nothing leaves the marking as it found it, and the
 * marking alone decides a step, so no later step would fire either. The run
 * ends there as a deadlock, and that step is not counted.
 */
export function createStepStepper(config: RunStepperConfig): RunStepper {
  const run = createStepperRunState(config, 1);
  /** Steps that fired at least one transition. */
  let steps = 0;

  const advanceOf = (
    kind: RunAdvance["kind"],
    fired: readonly string[],
  ): RunAdvance => ({
    time: steps,
    kind,
    firedTransitionIds: fired,
    completion: run.completionReason,
    error: run.error,
  });

  return {
    run,
    get time() {
      return steps;
    },
    advance(stopAt) {
      if (stopAt !== undefined && steps + 1 > stopAt) {
        return advanceOf("stopped", []);
      }
      if (!advanceRun(run)) {
        // The run was already over, or the step failed: there is no new
        // state.
        return advanceOf("stopped", []);
      }
      const fired = firedTransitionIds(run);
      if (fired.length === 0) {
        // The engine ended the run as a deadlock. The step is not counted.
        return advanceOf("stopped", []);
      }
      steps += 1;
      return advanceOf("firing", fired);
    },
  };
}
