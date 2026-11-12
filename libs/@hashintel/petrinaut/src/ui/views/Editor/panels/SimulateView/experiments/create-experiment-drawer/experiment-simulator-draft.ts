/**
 * The Create Experiment form's simulator choice as plain data, and what it
 * resolves to against the simulators a host registers.
 */
import {
  DEFAULT_EXPERIMENT_SAMPLE_PERIOD,
  simulatorSamplePeriod,
  type SimulatorRegistration,
  type StoredSimulatorParameters,
} from "@hashintel/petrinaut-core";

import { findSimulator } from "../../../../../../../react/simulators/context";
import { acceptsSimulatorParameter } from "../../../../../../components/simulator-parameter-input";

import type {
  SimulatorSelection,
  SimulatorsContextValue,
} from "../../../../../../../react/simulators/context";

export type ExperimentSimulatorDraft = {
  /** The simulator picked, or null while the form stands on the default one. */
  readonly simulatorId: string | null;
  /** The values typed for each simulator, kept when another one is picked. */
  readonly parametersBySimulator: Readonly<
    Record<string, StoredSimulatorParameters>
  >;
  /**
   * The field's text for the spacing of the samples, read for a simulator
   * that has no time step to sample at.
   */
  readonly samplePeriod: string;
};

export const EMPTY_EXPERIMENT_SIMULATOR: ExperimentSimulatorDraft = {
  simulatorId: null,
  parametersBySimulator: {},
  samplePeriod: String(DEFAULT_EXPERIMENT_SAMPLE_PERIOD),
};

/** Why a simulator cannot be picked. */
export type SimulatorRefusal = {
  readonly reason: string;
  /**
   * True while the verdict is still being worked out, so that a picker can
   * tell a slow answer from a negative one.
   */
  readonly pending: boolean;
};

/** Each simulator's refusal by id; null or absent when it can be picked. */
export type SimulatorRefusals = ReadonlyMap<string, SimulatorRefusal | null>;

export type ResolvedExperimentSimulator = {
  /** The simulator the experiment would run on; undefined when none can. */
  readonly registration: SimulatorRegistration | undefined;
  /** The values its fields show: the defaults under what was typed. */
  readonly parameters: StoredSimulatorParameters;
  /** What `createExperiment` takes; null when no simulator can run it. */
  readonly selection: SimulatorSelection | null;
  /**
   * The simulator's time step when it samples at one. The Sample every
   * field shows only without it.
   */
  readonly timeStep: number | null;
  /** The spacing of the samples: the time step, or the field's value. */
  readonly samplePeriod: number;
};

/**
 * The simulator a draft stands for. The picked one while it can be picked;
 * otherwise the default, so a net edited until the picked simulator refuses
 * it neither shows that simulator as chosen nor submits it. The default is
 * the one a Stochastic simulation starts on.
 */
export const resolveExperimentSimulator = (
  draft: ExperimentSimulatorDraft,
  simulators: SimulatorsContextValue,
  refusals: SimulatorRefusals,
): ResolvedExperimentSimulator => {
  const fallback = simulators.defaultSelections.stochastic;
  const allowed = (simulatorId: string | null) =>
    simulatorId === null || refusals.get(simulatorId)
      ? undefined
      : findSimulator(simulators.registrations, simulatorId);
  const registration =
    allowed(draft.simulatorId) ??
    allowed(fallback.simulatorId) ??
    simulators.registrations.find(({ id }) => !refusals.get(id));

  const parameters: StoredSimulatorParameters = registration
    ? {
        ...(registration.id === fallback.simulatorId
          ? fallback.parameters
          : {}),
        ...draft.parametersBySimulator[registration.id],
      }
    : {};
  const timeStep = registration
    ? simulatorSamplePeriod(registration, parameters)
    : null;

  return {
    registration,
    parameters,
    selection: registration
      ? { simulatorId: registration.id, parameters }
      : null,
    timeStep,
    samplePeriod: timeStep ?? Number(draft.samplePeriod),
  };
};

/**
 * The draft with one parameter of a simulator set, or the draft as it was
 * when the simulator's spec rejects the value.
 */
export const withSimulatorParameter = (
  draft: ExperimentSimulatorDraft,
  registration: SimulatorRegistration,
  current: StoredSimulatorParameters,
  key: string,
  value: number | boolean | string,
): ExperimentSimulatorDraft =>
  acceptsSimulatorParameter(registration.parameters, current, key, value)
    ? {
        ...draft,
        parametersBySimulator: {
          ...draft.parametersBySimulator,
          [registration.id]: { ...current, [key]: value },
        },
      }
    : draft;

/**
 * What stops the experiment from running on the resolved simulator, or
 * null: no simulator takes it, or its samples have no positive spacing.
 */
export const experimentSimulatorError = (
  resolved: ResolvedExperimentSimulator,
): string | null => {
  if (!resolved.registration) {
    return "No simulator can run this experiment";
  }
  return Number.isFinite(resolved.samplePeriod) && resolved.samplePeriod > 0
    ? null
    : "Sample every must be a positive number";
};
