import { createRunStepper, type StepperSelection } from "./steppers";

import type { MonteCarloRunDriverFactory } from "../../monte-carlo/run-driver";

/**
 * The run drivers of a stepper's simulator, for an experiment: each run is
 * advanced by its own stepper, stopped at every sample time.
 *
 * The stops are the samples of the experiment, so they are the same
 * whenever the experiment is computed, and so are the runs.
 *
 * A run of an untimed net is stepped in steps whichever simulator is
 * selected, as a single run is.
 */
export const createStepperRunDriverFactory =
  (selection: StepperSelection): MonteCarloRunDriverFactory =>
  (config, runConfig, index) => {
    const stepper = createRunStepper(selection, {
      sdcpn: config.sdcpn,
      ...(config.extensions === undefined
        ? {}
        : { extensions: config.extensions }),
      ...(config.hirArtifacts === undefined
        ? {}
        : { hirArtifacts: config.hirArtifacts }),
      initialMarking: config.initialMarking,
      parameterValues: config.parameterValues ?? {},
      seed: config.seed ?? 1,
      maxTime: config.maxTime,
      runIndex: index,
      ...(config.runIndexOffset === undefined
        ? {}
        : { runIndexOffset: config.runIndexOffset }),
      ...(runConfig === undefined ? {} : { runConfig }),
    });
    const { transitionIndexById } = stepper.run.simulation.frameLayout;
    return {
      run: stepper.run,
      get time() {
        return stepper.time;
      },
      advanceTo(time) {
        const fired = new Set<number>();
        for (;;) {
          const advance = stepper.advance(time);
          for (const transitionId of advance.firedTransitionIds) {
            const transitionIndex = transitionIndexById.get(transitionId);
            if (transitionIndex !== undefined) {
              fired.add(transitionIndex);
            }
          }
          if (
            advance.kind === "stopped" ||
            advance.completion !== null ||
            advance.error !== null
          ) {
            break;
          }
        }
        // The stepper flags what fired in its last advance. A sample reads
        // the flags as what fired since the sample before it, which is every
        // advance of this stretch.
        const flags = stepper.run.currentFrame.transitionFiredFlags;
        flags.fill(0);
        for (const transitionIndex of fired) {
          flags[transitionIndex] = 1;
        }
      },
    };
  };
