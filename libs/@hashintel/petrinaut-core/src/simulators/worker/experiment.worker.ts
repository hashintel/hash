/**
 * The Monte Carlo worker of the editor: the experiment protocol, hosting the
 * fixed-step engine and every simulator that has a stepper.
 */
import { createWorkerThreadRuntime } from "../../environment/environment";
import { attachMonteCarloWorker } from "../../simulation/monte-carlo/worker/attach";
import { createStepperRunDriverFactory } from "../../simulation/steppers/stepper-run-driver";

attachMonteCarloWorker(createWorkerThreadRuntime(), {
  createRunDriver: createStepperRunDriverFactory,
});
