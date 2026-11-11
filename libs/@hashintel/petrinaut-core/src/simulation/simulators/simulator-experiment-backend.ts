import { resolveSimulatorParameters } from "./parameters";

import type {
  ExperimentAssessment,
  ExperimentBlocker,
  ExperimentBlockers,
} from "../../experiments/experiment-assessment";
import type {
  ExperimentBackend,
  ExperimentBackendRegistration,
} from "../../experiments/experiment-backend";
import type { ExperimentRequest } from "../../experiments/experiment-request";
import type { StoredSimulatorParameters } from "./parameters";
import type {
  Simulator,
  SimulatorManifest,
  SimulatorRegistration,
} from "./simulator";

/**
 * The time step an experiment of a simulator is sampled at, with the
 * parameter values a form holds: the stored value, or the parameter's
 * default. Null for a simulator that leaves the sample period to the
 * experiment.
 */
export const simulatorSamplePeriod = (
  manifest: Pick<SimulatorManifest, "parameters" | "samplePeriodParameter">,
  parameters: StoredSimulatorParameters,
): number | null => {
  const key = manifest.samplePeriodParameter;
  const spec = key === undefined ? undefined : manifest.parameters[key];
  if (key === undefined || spec?.type !== "number") {
    return null;
  }
  const stored = parameters[key];
  return typeof stored === "number" ? stored : spec.default;
};

const refusal = (
  blocker: ExperimentBlocker,
  ...rest: ExperimentBlocker[]
): { eligible: false; blockers: ExperimentBlockers } => ({
  eligible: false,
  blockers: [blocker, ...rest],
});

const assessWith = async (
  registration: SimulatorRegistration,
  simulator: Simulator,
  parameters: StoredSimulatorParameters,
  request: ExperimentRequest,
): Promise<ExperimentAssessment> => {
  const resolved = resolveSimulatorParameters(
    registration.parameters,
    parameters,
  );
  if (!resolved.ok) {
    const [first, ...rest] = resolved.problems.map(
      ({ key, message }): ExperimentBlocker => ({
        code: "invalid-simulator-parameter",
        message,
        origin: "configuration",
        itemId: key,
      }),
    );
    return refusal(first!, ...rest);
  }

  const assessment = await simulator.assess({
    sdcpn: request.sdcpn,
    ...(request.extensions === undefined
      ? {}
      : { extensions: request.extensions }),
    initialMarking: request.initialMarking,
    parameterValues: request.parameterValues,
    seed: request.seed,
    maxTime: request.maxTime,
    ...(request.hirArtifacts === undefined
      ? {}
      : { hirArtifacts: request.hirArtifacts }),
    simulatorParameters: resolved.values,
  });
  if (!assessment.eligible) {
    return assessment;
  }
  const { startExperiment } = assessment;
  if (!startExperiment) {
    return refusal({
      code: "simulator-computes-no-experiments",
      message: `${registration.label} computes one run at a time`,
      origin: "configuration",
    });
  }

  return {
    eligible: true,
    notes: assessment.notes,
    instantiate: (options) =>
      startExperiment(
        {
          runCount: request.runCount,
          ...(request.runPlan === undefined
            ? {}
            : { runPlan: request.runPlan }),
          metricSpecs: request.metricSpecs,
          samplePeriod: request.dt,
        },
        options,
      ),
  };
};

/**
 * A registered simulator as an experiment backend, with the parameter
 * values a form holds bound to it. Whatever selects among experiment
 * backends, falls back from one to the next and re-assesses one per batch of
 * a sweep then runs any simulator a host registers.
 *
 * The request's `dt` is the experiment's sample period. A simulator that
 * samples at a time step refuses a request that names another, so the caller
 * takes {@link simulatorSamplePeriod} when it gives one.
 *
 * Each `load` loads the simulator anew: the backend it resolves with owns
 * what that simulator keeps, and `dispose` releases it.
 */
export const experimentBackendOfSimulator = (
  registration: SimulatorRegistration,
  parameters: StoredSimulatorParameters,
): ExperimentBackendRegistration => ({
  id: registration.id,
  label: registration.label,
  load: async (): Promise<ExperimentBackend> => {
    if (!registration.isAvailable()) {
      return {
        id: registration.id,
        label: registration.label,
        needsHirTrees: false,
        isAvailable: registration.isAvailable,
        assess: () =>
          Promise.resolve(
            refusal({
              code: "simulator-unavailable",
              message: `${registration.label} cannot run in this environment`,
              origin: "environment",
            }),
          ),
      };
    }
    const simulator = await registration.load();
    return {
      id: registration.id,
      label: registration.label,
      needsHirTrees: simulator.needsHirTrees,
      isAvailable: registration.isAvailable,
      assess: (request) =>
        assessWith(registration, simulator, parameters, request),
      ...(simulator.dispose === undefined
        ? {}
        : { dispose: simulator.dispose }),
    };
  },
});
