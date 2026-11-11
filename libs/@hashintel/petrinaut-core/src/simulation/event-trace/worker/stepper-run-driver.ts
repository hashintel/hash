import { createStepper, type StepperSelection } from "./steppers";

import type { MonteCarloRunDriverFactory } from "../../monte-carlo/run-driver";

/**
 * The run drivers of a stepper's simulator, for an experiment: each run is
 * advanced by its own stepper, stopped at every sample time.
 *
 * The stops are the samples of the experiment, so they are the same
 * whenever the experiment is computed, and so are the runs.
 */
export const createStepperRunDriverFactory =
  (selection: StepperSelection): MonteCarloRunDriverFactory =>
  (config, runConfig, index) => {
    const stepper = createStepper(selection, {
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
    return {
      run: stepper.run,
      get time() {
        return stepper.time;
      },
      advanceTo(time) {
        for (;;) {
          const advance = stepper.advance(time);
          if (
            advance.kind === "stopped" ||
            advance.completion !== null ||
            advance.error !== null
          ) {
            return;
          }
        }
      },
    };
  };
