import type { ExperimentBackend } from "../../experiments/experiment-backend";
import type { ExperimentRequest } from "../../experiments/experiment-request";
import type {
  SimulatorParameterSpecs,
  SimulatorParameterValues,
} from "./parameters";
import type { Simulator } from "./simulator";

/**
 * An experiment backend as a simulator that computes experiments.
 *
 * Both built-in backends step and sample on one time step, so an experiment
 * samples at the simulator's time step: asked for a different period, the
 * simulator refuses rather than rounds.
 */
export const simulatorFromExperimentBackend = <
  const Specs extends SimulatorParameterSpecs,
>(
  backend: ExperimentBackend,
  timeStepOf: (parameters: SimulatorParameterValues<Specs>) => number,
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
        const dt = timeStepOf(request.simulatorParameters);
        if (
          experiment.samplePeriod !== undefined &&
          experiment.samplePeriod !== dt
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
