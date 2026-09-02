import {
  compileScenario,
  getDefaultMonteCarloShardCount,
  getOwn,
  prepareScenarioCompiler,
  synthesizeAdHocScenario,
  type InitialMarking,
  type PetrinautExtensionSettings,
  type Scenario,
  type ScenarioParameter,
  type SDCPN,
} from "@hashintel/petrinaut-core";
import {
  createWorkerPoolExperimentBackend,
  WORKER_POOL_BACKEND_ID,
} from "@hashintel/petrinaut-core/experiments";

import { buildParameterAxis, fullSweepSelection } from "../parameter-grid";

import type { LanguageClientContextValue } from "../../lsp/context";
import type { CreateExperimentInput, ExperimentRecord } from "../context";
import type { ExperimentParameterAxis } from "../parameter-grid";
import type {
  BuildExperimentRequest,
  SweptScenarioCompiler,
} from "./shared/experiment-request";
import type {
  ExperimentBackendRegistration,
  ReusableWorkerFactory,
} from "@hashintel/petrinaut-core/experiments";

export const assertExperimentInput = (input: CreateExperimentInput): void => {
  if (input.name.trim() === "") {
    throw new Error("Experiment name is required");
  }
  if (!Number.isInteger(input.runCount) || input.runCount <= 0) {
    throw new Error("Runs must be a positive integer");
  }
  if (!Number.isInteger(input.seed)) {
    throw new Error("Seed must be an integer");
  }
  if (!Number.isFinite(input.dt) || input.dt <= 0) {
    throw new Error("Time step must be a positive number");
  }
  if (!Number.isFinite(input.maxTime) || input.maxTime <= 0) {
    throw new Error("Max time must be a positive number");
  }
  if (input.metricSpecs.length === 0) {
    throw new Error("Define at least one metric");
  }

  const metricIds = new Set<string>();
  for (const metricSpec of input.metricSpecs) {
    const metricId = metricSpec.id.trim();
    if (metricId === "") {
      throw new Error("Metric id is required");
    }
    if (metricIds.has(metricId)) {
      throw new Error(`Metric id "${metricId}" is duplicated`);
    }
    metricIds.add(metricId);
    if (metricSpec.label.trim() === "") {
      throw new Error("Metric label is required");
    }
    if (metricSpec.kind === "expression" && metricSpec.code.trim() === "") {
      throw new Error(`Metric "${metricSpec.label}" code is required`);
    }
  }
};

/**
 * Expands the create-form's per-parameter inputs into fixed string values and
 * sweep axes. Ranged inputs on parameters the scenario does not declare are
 * ignored, as fixed values on them are.
 */
export const buildSweepAxes = (
  scenario: Scenario | null,
  inputs: CreateExperimentInput["scenarioParameterValues"],
): { fixedValues: Record<string, string>; axes: ExperimentParameterAxis[] } => {
  const fixedValues: Record<string, string> = {};
  const axes: ExperimentParameterAxis[] = [];

  for (const parameter of scenario?.scenarioParameters ?? []) {
    const input = inputs[parameter.identifier] ?? { mode: "fixed", value: "" };
    if (input.mode === "fixed") {
      fixedValues[parameter.identifier] = input.value;
      continue;
    }

    const outcome = buildParameterAxis(parameter, input);
    if (!outcome.ok) {
      throw new Error(outcome.error);
    }
    axes.push(outcome.axis);
  }

  return { fixedValues, axes };
};

const parseScenarioParameterValue = (
  parameter: ScenarioParameter,
  rawValue: string | undefined,
): number | string => {
  const value =
    rawValue === undefined || rawValue.trim() === ""
      ? String(parameter.default)
      : rawValue.trim();

  if (parameter.type === "boolean") {
    const normalizedValue = value.toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalizedValue)) {
      return 1;
    }
    if (["0", "false", "no", "off"].includes(normalizedValue)) {
      return 0;
    }
    return `${parameter.identifier} must be true or false`;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return `${parameter.identifier} must be a finite number`;
  }
  if (parameter.type === "integer" && !Number.isInteger(parsed)) {
    return `${parameter.identifier} must be an integer`;
  }
  if (parameter.type === "ratio" && (parsed < 0 || parsed > 1)) {
    return `${parameter.identifier} must be between 0 and 1`;
  }

  return parsed;
};

/**
 * Parses the fixed values of every scenario parameter. Swept parameters have
 * no fixed value; their errors are range errors `buildSweepAxes` already
 * threw, so they are dropped here.
 */
const parseFixedScenarioValues = (
  scenario: Scenario,
  fixedValues: Record<string, string>,
  axes: readonly ExperimentParameterAxis[],
): Record<string, number> => {
  const swept = new Set(axes.map((axis) => axis.identifier));
  const values: Record<string, number> = {};
  const errors: string[] = [];
  for (const parameter of scenario.scenarioParameters) {
    const parsed = parseScenarioParameterValue(
      parameter,
      fixedValues[parameter.identifier],
    );
    if (typeof parsed !== "string") {
      values[parameter.identifier] = parsed;
    } else if (!swept.has(parameter.identifier)) {
      errors.push(parsed);
    }
  }
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
  return values;
};

const formatCompileErrors = (
  errors: readonly { source: string; itemId: string; message: string }[],
): string =>
  errors
    .map((error) => `${error.source}:${error.itemId} ${error.message}`)
    .join("\n");

export type CompiledExperimentScenario = {
  parameterValues: Record<string, string>;
  initialMarking: InitialMarking;
  /** Present for a selected scenario; a sweep compiles through it per batch. */
  sweptCompiler: SweptScenarioCompiler | null;
};

/**
 * Compiles the experiment's scenario — the selected one, an ad-hoc one, or
 * none — into the request's parameter values and initial marking.
 */
export const compileExperimentScenario = async ({
  input,
  scenario,
  fixedValues,
  axes,
  sdcpn,
  requestScenarioHir,
}: {
  input: CreateExperimentInput;
  scenario: Scenario | null;
  fixedValues: Record<string, string>;
  axes: readonly ExperimentParameterAxis[];
  /** The net as the experiment runs it (parameters stripped when disabled). */
  sdcpn: SDCPN;
  requestScenarioHir: LanguageClientContextValue["requestScenarioHir"];
}): Promise<CompiledExperimentScenario> => {
  const context = {
    netParameters: sdcpn.parameters,
    places: sdcpn.places,
    types: sdcpn.types,
  };

  if (scenario) {
    const fixed = parseFixedScenarioValues(scenario, fixedValues, axes);
    const scenarioHir = await requestScenarioHir(scenario, context);
    // Prepared once per experiment: a sweep compiles per batch and per run's
    // draws, and preparation carries the type checks and context building
    // those calls would otherwise repeat.
    const prepared = prepareScenarioCompiler(
      scenario,
      scenarioHir,
      sdcpn.parameters,
      sdcpn.places,
      sdcpn.types,
    );
    const sweptCompiler: SweptScenarioCompiler = {
      compileForValues: (swept) => {
        const compiled = prepared.compile({ ...fixed, ...swept });
        if (!compiled.ok) {
          throw new Error(formatCompileErrors(compiled.errors));
        }
        return compiled;
      },
      compileRunNumbers: (swept) => {
        const compiled = prepared.compileParameterNumbers({
          ...fixed,
          ...swept,
        });
        if (!compiled.ok) {
          throw new Error(formatCompileErrors(compiled.errors));
        }
        return { parameters: compiled.parameters };
      },
    };
    const compiled = sweptCompiler.compileForValues({});
    return {
      parameterValues: compiled.result.parameterValues,
      initialMarking: compiled.result.initialState,
      sweptCompiler,
    };
  }

  if (input.adHocScenario) {
    const synthesized = synthesizeAdHocScenario(input.adHocScenario, context);
    if (!synthesized.ok) {
      throw new Error(formatCompileErrors(synthesized.errors));
    }
    const scenarioHir = await requestScenarioHir(synthesized.scenario);
    const compiled = compileScenario(
      synthesized.scenario,
      scenarioHir,
      sdcpn.parameters,
      sdcpn.places,
      sdcpn.types,
    );
    if (!compiled.ok) {
      throw new Error(formatCompileErrors(compiled.errors));
    }
    return {
      parameterValues: compiled.result.parameterValues,
      initialMarking: compiled.result.initialState,
      sweptCompiler: null,
    };
  }

  return { parameterValues: {}, initialMarking: {}, sweptCompiler: null };
};

export const newExperimentRecord = ({
  id,
  input,
  scenarioName,
  axes,
}: {
  id: string;
  input: CreateExperimentInput;
  scenarioName: string | null;
  axes: readonly ExperimentParameterAxis[];
}): ExperimentRecord => ({
  id,
  name: input.name.trim(),
  createdAt: Date.now(),
  scenarioId: input.scenarioId,
  scenarioName,
  runCount: input.runCount,
  seed: input.seed,
  dt: input.dt,
  maxTime: input.maxTime,
  status: "initializing",
  error: null,
  metricSpecs: input.metricSpecs,
  computeBackend: "cpu",
  computeBackendFallbackReason: null,
  startedAt: null,
  finishedAt: null,
  progress: null,
  latestMetricFramesById: {},
  metricFrames: [],
  sweepBatches: [],
  parameterAxes: axes,
  sweep:
    axes.length > 0
      ? {
          selection: fullSweepSelection(axes),
          runsCompleted: 0,
          runsSampled: 0,
          runTarget: null,
          computing: true,
        }
      : null,
});

/**
 * The net the experiment compiles and runs: its metrics replaced by the
 * experiment's expression metrics, so they compile alongside the model's user
 * code in the language worker.
 */
export const experimentSdcpnWithMetrics = (
  sdcpn: SDCPN,
  metricSpecs: CreateExperimentInput["metricSpecs"],
): SDCPN => ({
  ...sdcpn,
  metrics: metricSpecs
    .filter((spec) => spec.kind === "expression")
    .map((spec) => ({ id: spec.id, name: spec.label, code: spec.code })),
});

/**
 * Builds the backend request for the experiment. HIR artifacts are compiled
 * per `needsHirTrees` value and memoized: the trees roughly triple the
 * payload structured-cloned to every shard worker and only a
 * shader-generating backend reads them, while re-lowering the whole net per
 * batch was most of the delay between a slider move and its first frames.
 * A failed compile is not cached, so a transient worker error stays
 * retryable.
 */
export const createExperimentRequestBuilder = ({
  input,
  sdcpn,
  extensions,
  compiled,
  requestHirArtifacts,
}: {
  input: CreateExperimentInput;
  /** The exact snapshot to run, metrics substituted. */
  sdcpn: SDCPN;
  extensions: PetrinautExtensionSettings;
  compiled: CompiledExperimentScenario;
  requestHirArtifacts: LanguageClientContextValue["requestHirArtifacts"];
}): BuildExperimentRequest => {
  const artifactsMemo = new Map<
    boolean,
    ReturnType<typeof requestHirArtifacts>
  >();
  const requestArtifactsOnce = (needsHirTrees: boolean) => {
    const cached = artifactsMemo.get(needsHirTrees);
    if (cached) {
      return cached;
    }
    const pending = requestHirArtifacts(sdcpn, extensions, {
      includeHir: needsHirTrees,
    });
    artifactsMemo.set(needsHirTrees, pending);
    pending.catch(() => artifactsMemo.delete(needsHirTrees));
    return pending;
  };

  return async ({ needsHirTrees, override }) => {
    const { artifacts, failures } = await requestArtifactsOnce(needsHirTrees);

    const metricSpecs = input.metricSpecs.map((spec) => {
      if (spec.kind !== "expression") {
        return spec;
      }
      const artifact = getOwn(artifacts.metrics, spec.id);
      if (!artifact) {
        const diagnostics = failures
          .filter(
            (failure) =>
              failure.itemType === "metric" && failure.itemId === spec.id,
          )
          .flatMap((failure) =>
            failure.diagnostics.map((diagnostic) => diagnostic.message),
          );
        throw new Error(
          `Metric "${spec.label}" did not compile${
            diagnostics.length > 0 ? `: ${diagnostics.join("; ")}` : ""
          }`,
        );
      }
      return { ...spec, artifact };
    });

    return {
      sdcpn,
      extensions,
      initialMarking: compiled.initialMarking,
      parameterValues: compiled.parameterValues,
      seed: input.seed,
      dt: input.dt,
      maxTime: input.maxTime,
      runCount: input.runCount,
      metricSpecs,
      hirArtifacts: artifacts,
      ...override,
    };
  };
};

/**
 * Backends in preference order, best first. The GPU backend is a candidate
 * only when asked for; the worker-pool backend is always last because it
 * accepts everything, which is what makes it the fallback.
 */
export const experimentBackendRegistrations = ({
  computeBackend,
  createWorker,
  shardCount,
}: {
  computeBackend: CreateExperimentInput["computeBackend"];
  createWorker: ReusableWorkerFactory;
  shardCount: number | undefined;
}): ExperimentBackendRegistration[] => {
  const registrations: ExperimentBackendRegistration[] = [];
  if (computeBackend === "webgpu") {
    registrations.push({
      id: "webgpu",
      label: "GPU (WebGPU)",
      // Imported here, not at module scope, so a session that never asks
      // for the GPU never loads the shader generator.
      load: async () => {
        const { createWebGpuExperimentBackend } =
          await import("@hashintel/petrinaut-core/webgpu");
        return createWebGpuExperimentBackend();
      },
    });
  }
  registrations.push({
    id: WORKER_POOL_BACKEND_ID,
    label: "CPU (Web Workers)",
    load: () =>
      Promise.resolve(
        createWorkerPoolExperimentBackend({
          createWorker,
          // The experiment never inspects the host, so the provider — the
          // piece that knows this is a browser — states the parallelism.
          shardCount: shardCount ?? getDefaultMonteCarloShardCount(),
        }),
      ),
  });
  return registrations;
};
