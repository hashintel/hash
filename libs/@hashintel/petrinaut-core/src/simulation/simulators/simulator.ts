import { resolveSimulatorParameters } from "./parameters";

import type { AbortSignalLike } from "../../environment";
import type {
  ExperimentBlockers,
  ExperimentNote,
} from "../../experiments/experiment-assessment";
import type { ExperimentRunPlan } from "../../experiments/experiment-request";
import type { PetrinautExtensionSettings } from "../../extensions";
import type { HirArtifacts } from "../../hir-runtime";
import type { SDCPN } from "../../types/sdcpn";
import type { InitialMarking } from "../api";
import type { EventSimulation } from "../event-trace";
import type { MonteCarloMetricSpec } from "../monte-carlo/metrics/types";
import type { MonteCarloExperiment } from "../monte-carlo/runtime/experiment";
import type {
  SimulatorParameterSpecs,
  SimulatorParameterValues,
  StoredSimulatorParameters,
} from "./parameters";

/** What every computation of a net needs, whichever simulator runs it. */
export type SimulationRequest<
  Specs extends SimulatorParameterSpecs = SimulatorParameterSpecs,
> = {
  readonly sdcpn: SDCPN;
  readonly extensions?: PetrinautExtensionSettings;
  readonly initialMarking: InitialMarking;
  readonly parameterValues: Readonly<Record<string, string>>;
  readonly seed: number;
  /** Simulation time a run stops at. Null runs until deadlock or stop. */
  readonly maxTime: number | null;
  readonly hirArtifacts?: HirArtifacts;
  readonly simulatorParameters: SimulatorParameterValues<Specs>;
};

/** What an experiment adds to a {@link SimulationRequest}. */
export type SimulatorExperimentRequest = {
  readonly runCount: number;
  /** Per-run parameter values, as a sweep assigns them. */
  readonly runPlan?: ExperimentRunPlan;
  readonly metricSpecs: readonly MonteCarloMetricSpec[];
  /**
   * Spacing of the grid the metrics are observed on, in simulated seconds.
   * A metric frame's `frameNumber` is its index on this grid.
   */
  readonly samplePeriod: number;
};

export type SimulatorStartOptions = {
  readonly signal?: AbortSignalLike;
  readonly onNote?: (note: ExperimentNote) => void;
};

/** A started computation, or the reasons starting it was refused. */
export type SimulatorStart<Handle> =
  | {
      readonly ok: true;
      readonly handle: Handle;
      /** What ran it, for display: a device name, a worker count. */
      readonly runtimeInfo?: string;
    }
  | { readonly ok: false; readonly blockers: ExperimentBlockers };

/** An eligible assessment: the starts the simulator offers for the request. */
export type SimulatorOffer = {
  readonly eligible: true;
  readonly notes: readonly ExperimentNote[];
  /** One run, recorded as events and read back at any time. */
  startRun?(
    this: void,
    options?: SimulatorStartOptions,
  ): Promise<SimulatorStart<EventSimulation>>;
  /** Many runs, read back as metric frames on a sample grid. */
  startExperiment?(
    this: void,
    experiment: SimulatorExperimentRequest,
    options?: SimulatorStartOptions,
  ): Promise<SimulatorStart<MonteCarloExperiment>>;
};

/**
 * Whether a simulator takes a request, decided from the net and the
 * parameters alone, without acquiring a worker or a device.
 */
export type SimulatorAssessment =
  | SimulatorOffer
  | { readonly eligible: false; readonly blockers: ExperimentBlockers };

export type Simulator<
  Specs extends SimulatorParameterSpecs = SimulatorParameterSpecs,
> = {
  /** True when the simulator reads the HIR trees of the user's code itself. */
  readonly needsHirTrees: boolean;
  assess(
    this: void,
    request: SimulationRequest<Specs>,
  ): Promise<SimulatorAssessment>;
  dispose?(this: void): void;
};

/** What a simulator computes: single runs, experiments, or both. */
export type SimulatorProducts = {
  readonly run: boolean;
  readonly experiment: boolean;
};

/**
 * What a picker shows. Everything here is plain data, so listing simulators
 * loads none of them.
 */
export type SimulatorManifest<
  Specs extends SimulatorParameterSpecs = SimulatorParameterSpecs,
> = {
  /** A built-in's name, or `<pluginId>.<key>` for one a plugin contributes. */
  readonly id: string;
  readonly label: string;
  /** One sentence under the label in the picker. */
  readonly description: string;
  readonly parameters: Specs;
  readonly produces: SimulatorProducts;
};

export type SimulatorImplementation<
  Specs extends SimulatorParameterSpecs = SimulatorParameterSpecs,
> = {
  /** Whether this environment can run it at all, for example whether WebGPU exists. */
  isAvailable(this: void): boolean;
  load(this: void): Promise<Simulator<Specs>>;
};

/** What a host registers. */
export type SimulatorRegistration<
  Specs extends SimulatorParameterSpecs = SimulatorParameterSpecs,
> = SimulatorManifest<Specs> & SimulatorImplementation<Specs>;

/**
 * Declares a simulator. The manifest comes first, so the implementation's
 * requests are typed by the parameters it declares. Throws when an enum
 * parameter defaults to a value outside its options.
 */
export const defineSimulator = <const Specs extends SimulatorParameterSpecs>(
  manifest: SimulatorManifest<Specs>,
  implementation: SimulatorImplementation<Specs>,
): SimulatorRegistration<Specs> => {
  for (const [key, spec] of Object.entries(manifest.parameters)) {
    if (
      spec.type === "enum" &&
      !spec.options.some((option) => option.value === spec.default)
    ) {
      throw new Error(
        `Simulator "${manifest.id}" parameter "${key}" defaults to "${spec.default}", which is not one of its options`,
      );
    }
  }
  return { ...manifest, ...implementation };
};

/** A request before a simulator's parameters are resolved into it. */
export type SimulationRequestBase = Omit<
  SimulationRequest,
  "simulatorParameters"
>;

export type SimulatorSelectionOutcome =
  | { readonly ok: true; readonly offer: SimulatorOffer }
  | { readonly ok: false; readonly blockers: ExperimentBlockers };

/**
 * Takes a registration and the parameter values a form holds to an offer:
 * checks the environment, resolves the parameters against the spec, loads
 * the simulator and has it assess the request. Nothing falls back to
 * another simulator: a refusal names its reason.
 *
 * `request` may be a function of the loaded simulator, for a host that
 * compiles the net's code only once it knows whether the simulator reads
 * the HIR trees.
 */
export const assessSimulator = async (
  registration: SimulatorRegistration,
  parameters: StoredSimulatorParameters,
  request:
    | SimulationRequestBase
    | ((
        simulator: Pick<Simulator, "needsHirTrees">,
      ) => SimulationRequestBase | Promise<SimulationRequestBase>),
): Promise<SimulatorSelectionOutcome> => {
  if (!registration.isAvailable()) {
    return {
      ok: false,
      blockers: [
        {
          code: "simulator-unavailable",
          message: `${registration.label} cannot run in this environment`,
          origin: "environment",
        },
      ],
    };
  }
  const resolved = resolveSimulatorParameters(
    registration.parameters,
    parameters,
  );
  if (!resolved.ok) {
    const [first, ...rest] = resolved.problems;
    const blocker = ({ key, message }: (typeof resolved.problems)[number]) =>
      ({
        code: "invalid-simulator-parameter",
        message,
        origin: "configuration",
        itemId: key,
      }) as const;
    return { ok: false, blockers: [blocker(first), ...rest.map(blocker)] };
  }
  const simulator = await registration.load();
  const requestBase =
    typeof request === "function" ? await request(simulator) : request;
  const assessment = await simulator.assess({
    ...requestBase,
    simulatorParameters: resolved.values,
  });
  return assessment.eligible
    ? { ok: true, offer: assessment }
    : { ok: false, blockers: assessment.blockers };
};
