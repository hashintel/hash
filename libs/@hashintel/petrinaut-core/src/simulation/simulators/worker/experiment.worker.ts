/**
 * The Monte Carlo worker of the editor: the experiment protocol, hosting the
 * fixed-step engine and every simulator that has a stepper.
 */
import { createWorkerThreadRuntime } from "../../../environment";
import { createStepperRunDriverFactory } from "../../event-trace/worker/stepper-run-driver";
import { attachMonteCarloWorker } from "../../monte-carlo/worker/attach";

attachMonteCarloWorker(createWorkerThreadRuntime(), {
  createRunDriver: createStepperRunDriverFactory,
});
