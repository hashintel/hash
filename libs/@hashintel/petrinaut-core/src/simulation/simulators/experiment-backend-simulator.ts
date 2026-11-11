import type { ExperimentBackend } from "../../experiments/experiment-backend";
import type { ExperimentRequest } from "../../experiments/experiment-request";
import type { MonteCarloSimulatorSelection } from "../monte-carlo/run-driver";
import type {
  SimulatorParameterSpecs,
  SimulatorParameterValues,
} from "./parameters";
import type { Simulator } from "./simulator";

/** The sample period of a simulator that has no step of its own to sample at. */
export const DEFAULT_EXPERIMENT_SAMPLE_PERIOD = 0.1;

export type ExperimentBackendSimulatorOptions<
  Specs extends SimulatorParameterSpecs,
> = {
  /**
   * The step the backend's own engine advances by, for a simulator that is
   * that engine. It steps and samples on one time step, so an experiment
   * samples at it: asked for a different period, the simulator refuses
   * rather than rounds.
   */
  timeStepOf?: (parameters: SimulatorParameterValues<Specs>) => number;
  /**
   * The simulator the backend's workers advance each run with, for one that
   * is not the backend's own engine. The experiment's sample period is then
   * free, and {@link DEFAULT_EXPERIMENT_SAMPLE_PERIOD} when it names none.
   */
  simulatorOf?: (
    parameters: SimulatorParameterValues<Specs>,
  ) => MonteCarloSimulatorSelection;
};

/**
 * An experiment backend as a simulator that computes experiments: with its
 * own engine at the simulator's time step, or with the simulator's runs
 * hosted in its workers.
 */
export const simulatorFromExperimentBackend = <
  const Specs extends SimulatorParameterSpecs,
>(
  backend: ExperimentBackend,
  { timeStepOf, simulatorOf }: ExperimentBackendSimulatorOptions<Specs>,
): Simulator<Specs> => ({
  needsHirTrees: backend.needsHirTrees,
  assess: (request) =>
    Promise.resolve({
      eligible: true,
      notes: [],
      startExperiment: async (experiment, options) => {
        const { maxTime } = request;
        if (maxTime === null) {
          return {
            ok: false,
            blockers: [
              {
                code: "experiment-needs-max-time",
                message: "An experiment needs a time to stop at",
                origin: "configuration",
              },
            ],
          };
        }
        const timeStep = timeStepOf?.(request.simulatorParameters);
        const dt =
          timeStep ??
          experiment.samplePeriod ??
          DEFAULT_EXPERIMENT_SAMPLE_PERIOD;
        if (
          timeStep !== undefined &&
          experiment.samplePeriod !== undefined &&
          experiment.samplePeriod !== timeStep
        ) {
          return {
            ok: false,
            blockers: [
              {
                code: "sample-period-differs-from-time-step",
                message: `${backend.label} samples at its time step, ${dt} s`,
                origin: "configuration",
              },
            ],
          };
        }
        const experimentRequest: ExperimentRequest = {
          sdcpn: request.sdcpn,
          ...(request.extensions === undefined
            ? {}
            : { extensions: request.extensions }),
          initialMarking: request.initialMarking,
          parameterValues: request.parameterValues,
          seed: request.seed,
          dt,
          maxTime,
          runCount: experiment.runCount,
          ...(experiment.runPlan === undefined
            ? {}
            : { runPlan: experiment.runPlan }),
          metricSpecs: experiment.metricSpecs,
          ...(request.hirArtifacts === undefined
            ? {}
            : { hirArtifacts: request.hirArtifacts }),
          ...(simulatorOf === undefined
            ? {}
            : { simulator: simulatorOf(request.simulatorParameters) }),
        };
        const assessment = await backend.assess(experimentRequest);
        if (!assessment.eligible) {
          return { ok: false, blockers: assessment.blockers };
        }
        const instantiation = await assessment.instantiate(options);
        return instantiation.ok
          ? {
              ok: true,
              handle: instantiation.handle,
              ...(instantiation.runtimeInfo === undefined
                ? {}
                : { runtimeInfo: instantiation.runtimeInfo }),
            }
          : { ok: false, blockers: instantiation.blockers };
      },
    }),
  ...(backend.dispose === undefined ? {} : { dispose: backend.dispose }),
});
