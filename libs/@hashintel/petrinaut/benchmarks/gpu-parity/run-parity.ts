import { DEFAULT_PETRINAUT_EXTENSIONS } from "@hashintel/petrinaut-core";
import {
  createWorkerPoolExperimentBackend,
  type ExperimentBackend,
  type ExperimentRequest,
} from "@hashintel/petrinaut-core/experiments";
import { compileHirArtifacts } from "@hashintel/petrinaut-core/hir";
import { createWebGpuExperimentBackend } from "@hashintel/petrinaut-core/webgpu";
import { createMonteCarloWorker } from "@hashintel/petrinaut-core/workers/monte-carlo";

import { metricSpecOf, parityModels, type ParityModel } from "./parity-models";
import { compareRuns, type BackendRun, type ParityRow } from "./parity-report";

/** The experiment every model runs on both backends. */
export type ParitySettings = {
  runCount: number;
  maxTime: number;
  dt: number;
  seed: number;
};

/** The rows measured so far, and whether every model has run. */
export type ParityProgress = { rows: ParityRow[]; finished: boolean };

const messagesOf = (blockers: readonly { message: string }[]) =>
  blockers.map((blocker) => blocker.message).join("; ");

/**
 * Runs a request on one backend to its end. A backend that cannot take the
 * request, and a run that ends any other way than complete, is an error:
 * the frames of a partial run would read as plausible parity numbers.
 */
const runBackend = async (
  backend: ExperimentBackend,
  request: ExperimentRequest,
  signal: AbortSignal,
): Promise<BackendRun | { error: string }> => {
  const assessment = await backend.assess(request);
  if (!assessment.eligible) {
    return { error: messagesOf(assessment.blockers) };
  }
  const instantiated = await assessment.instantiate();
  if (!instantiated.ok) {
    return { error: messagesOf(instantiated.blockers) };
  }
  const { handle } = instantiated;
  if (signal.aborted) {
    handle.dispose();
    return { error: "cancelled before the run started" };
  }

  const cancel = () => handle.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  const started = performance.now();
  const outcome = await new Promise<string>((resolve) => {
    const off = handle.events.subscribe((event) => {
      off();
      resolve(event.type);
    });
    handle.start();
  });
  const ms = performance.now() - started;
  signal.removeEventListener("abort", cancel);
  const frames = [...handle.metrics.get().frames];
  handle.dispose();

  return outcome === "complete"
    ? { frames, ms }
    : { error: `run ended with '${outcome}' after ${Math.round(ms)} ms` };
};

const requestOf = (
  model: ParityModel,
  settings: ParitySettings,
): ExperimentRequest => {
  const { artifacts } = compileHirArtifacts(model.sdcpn, undefined, {
    includeHir: true,
  });
  return {
    ...settings,
    sdcpn: model.sdcpn,
    extensions: DEFAULT_PETRINAUT_EXTENSIONS,
    initialMarking: model.initialMarking,
    parameterValues: {},
    metricSpecs: model.measures.map((measure) =>
      metricSpecOf(model, measure, artifacts),
    ),
    hirArtifacts: artifacts,
  };
};

/** One row per measure of the model, or one row that says which backend failed. */
const measureModel = async (
  model: ParityModel,
  settings: ParitySettings,
  signal: AbortSignal,
): Promise<ParityRow[]> => {
  const request = requestOf(model, settings);
  const cpu = await runBackend(
    createWorkerPoolExperimentBackend({
      createWorker: createMonteCarloWorker,
      shardCount: 4,
    }),
    request,
    signal,
  );
  if ("error" in cpu) {
    return [{ model: model.title, error: `CPU: ${cpu.error}` }];
  }
  const gpu = await runBackend(
    createWebGpuExperimentBackend(),
    request,
    signal,
  );
  if ("error" in gpu) {
    return [
      {
        model: model.title,
        cpuMs: Math.round(cpu.ms),
        error: `GPU: ${gpu.error}`,
      },
    ];
  }
  return request.metricSpecs.map((spec) =>
    compareRuns({
      label: `${model.title} · ${spec.label}`,
      metricId: spec.id,
      runCount: settings.runCount,
      cpu,
      gpu,
    }),
  );
};

/**
 * Runs every model through the worker-pool backend and then the WebGPU
 * backend, reporting the rows after each model. When all have run it logs
 * them as one `gpu-parity:` JSON line, for a script to read off the console.
 * Aborting the signal cancels the run in flight and reports nothing further.
 */
export const runParity = async (
  settings: ParitySettings,
  signal: AbortSignal,
  onProgress: (progress: ParityProgress) => void,
): Promise<void> => {
  const rows: ParityRow[] = [];
  for (const model of parityModels) {
    rows.push(...(await measureModel(model, settings, signal)));
    if (signal.aborted) {
      return;
    }
    onProgress({ rows: [...rows], finished: false });
  }
  // eslint-disable-next-line no-console -- the line scripts read the numbers from
  console.log(`gpu-parity: ${JSON.stringify(rows)}`);
  onProgress({ rows, finished: true });
};
