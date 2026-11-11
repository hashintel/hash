import { STEP_SAMPLE_PERIOD, type RunClock } from "../../net-timing";
import { resolveSimulatorSelection, simulatorUnavailable } from "./simulator";

import type { ExperimentAssessment } from "../../experiments/experiment-assessment";
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

/**
 * The spacing an experiment is sampled at when the experiment does not
 * choose it: every step on a clock that counts steps, else the simulator's
 * time step. Null when the experiment names its own.
 */
export const experimentSamplePeriod = (
  clock: RunClock,
  manifest: Pick<SimulatorManifest, "parameters" | "samplePeriodParameter">,
  parameters: StoredSimulatorParameters,
): number | null =>
  clock === "steps"
    ? STEP_SAMPLE_PERIOD
    : simulatorSamplePeriod(manifest, parameters);

const assessWith = async (
  registration: SimulatorRegistration,
  simulator: Simulator | null,
  parameters: StoredSimulatorParameters,
  request: ExperimentRequest,
): Promise<ExperimentAssessment> => {
  if (!simulator) {
    return { eligible: false, blockers: simulatorUnavailable(registration) };
  }
  const resolved = resolveSimulatorSelection(registration, parameters);
  if (!resolved.ok) {
    return { eligible: false, blockers: resolved.blockers };
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
    return {
      eligible: false,
      blockers: [
        {
          code: "simulator-computes-no-experiments",
          message: `${registration.label} computes one run at a time`,
          origin: "configuration",
        },
      ],
    };
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
 * samples at a time step refuses a request that names another, and so does
 * any simulator for an untimed net, which is sampled at every step. The
 * caller takes {@link experimentSamplePeriod} when it gives one.
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
    // A simulator this environment cannot run is not loaded: the selection
    // reads `isAvailable` and moves on.
    const simulator = registration.isAvailable()
      ? await registration.load()
      : null;
    return {
      id: registration.id,
      label: registration.label,
      needsHirTrees: simulator?.needsHirTrees ?? false,
      isAvailable: registration.isAvailable,
      assess: (request) =>
        assessWith(registration, simulator, parameters, request),
      ...(simulator?.dispose === undefined
        ? {}
        : { dispose: simulator.dispose }),
    };
  },
});
