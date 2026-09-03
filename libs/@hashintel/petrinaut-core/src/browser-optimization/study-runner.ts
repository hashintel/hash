/**
 * @talksTo optimizer-core via Python sources loaded into Pyodide
 */
import { micropipRequirements } from "./pyodide-config";
import { isPyProxyLike } from "./pyodide-like";

import type {
  OptimizationScalar,
  PetrinautOptimizationDescribeResult,
  PetrinautOptimizationTrialOutcome,
} from "../optimization";
import type {
  OptimizerBestTrial,
  OptimizerStudySummary,
  OptimizerTrialPayload,
} from "./messages";
import type { OptimizerPyodideConfig } from "./pyodide-config";
import type { LoadPyodide, PyodideLike } from "./pyodide-like";

export type OptimizerStudyRunInput = {
  description: PetrinautOptimizationDescribeResult;
  evaluate(
    trial: number,
    suggestedValues: Record<string, OptimizationScalar>,
  ): Promise<PetrinautOptimizationTrialOutcome>;
  onTrial(event: OptimizerTrialPayload): void;
  isCancelled(): boolean;
};

export type OptimizerStudyRunner = {
  /** Settles once Pyodide, the packages and the optimizer sources are loaded. */
  readonly ready: Promise<void>;
  /** Runs one study; concurrent calls run one after another. */
  run(input: OptimizerStudyRunInput): Promise<OptimizerStudySummary>;
};

/** The outcome shape `ask_tell.run_study` expects from its evaluate callback. */
type PythonTrialOutcome = { objective: number } | { pruned: string };

type PyodideEntryModule = {
  run_browser_study(
    descriptionJson: string,
    evaluate: (values: unknown) => Promise<PythonTrialOutcome>,
    onTrial: (payload: unknown) => void,
    isCancelled: () => boolean,
  ): Promise<unknown>;
};

const pythonSourceRoot = "/home/pyodide";

const toJsValue = (value: unknown): unknown =>
  isPyProxyLike(value)
    ? value.toJs({ dict_converter: Object.fromEntries })
    : value;

const asRecord = (value: unknown, what: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`The optimizer returned a malformed ${what}`);
  }
  return value as Record<string, unknown>;
};

const asNumber = (value: unknown, what: string): number => {
  if (typeof value !== "number") {
    throw new Error(`The optimizer returned a non-numeric ${what}`);
  }
  return value;
};

const asParameters = (value: unknown): Record<string, OptimizationScalar> => {
  const parameters: Record<string, OptimizationScalar> = {};
  for (const [identifier, scalar] of Object.entries(
    asRecord(value, "parameter set"),
  )) {
    if (typeof scalar !== "number" && typeof scalar !== "boolean") {
      throw new Error(
        `The optimizer suggested a non-scalar value for "${identifier}"`,
      );
    }
    parameters[identifier] = scalar;
  }
  return parameters;
};

const asBest = (value: unknown): OptimizerBestTrial | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const record = asRecord(value, "best trial");
  return {
    trial: asNumber(record.trial, "best trial number"),
    parameters: asParameters(record.parameters),
    objective: asNumber(record.objective, "best objective"),
  };
};

const asTrialState = (value: unknown): OptimizerTrialPayload["state"] => {
  if (value === "complete" || value === "pruned" || value === "failed") {
    return value;
  }
  throw new Error(`The optimizer reported an unknown trial state`);
};

const normalizeTrialPayload = (value: unknown): OptimizerTrialPayload => {
  const record = asRecord(value, "trial payload");
  const objective = record.objective;
  return {
    trial: asNumber(record.trial, "trial number"),
    parameters: asParameters(record.parameters),
    objective:
      objective === null || objective === undefined
        ? null
        : asNumber(objective, "trial objective"),
    state: asTrialState(record.state),
    best: asBest(record.best),
  };
};

const normalizeSummary = (value: unknown): OptimizerStudySummary => {
  const record = asRecord(value, "study summary");
  return {
    requestedTrials: asNumber(record.requestedTrials, "requested trial count"),
    completedTrials: asNumber(record.completedTrials, "completed trial count"),
    prunedTrials: asNumber(record.prunedTrials, "pruned trial count"),
    failedTrials: asNumber(record.failedTrials, "failed trial count"),
    best: asBest(record.best),
    ...(record.cancelled === true ? { cancelled: true } : {}),
  };
};

const toPythonOutcome = (
  outcome: PetrinautOptimizationTrialOutcome,
): PythonTrialOutcome =>
  outcome.kind === "objective"
    ? { objective: outcome.objective }
    : { pruned: outcome.reason };

const writePythonSources = (
  pyodide: PyodideLike,
  sources: Readonly<Record<string, string>>,
): void => {
  for (const [path, source] of Object.entries(sources)) {
    const absolutePath = `${pythonSourceRoot}/${path}`;
    pyodide.FS.mkdirTree(absolutePath.slice(0, absolutePath.lastIndexOf("/")));
    pyodide.FS.writeFile(absolutePath, source);
  }
};

const loadOptimizerEntry = async (options: {
  loadPyodide: LoadPyodide;
  config: OptimizerPyodideConfig;
  pythonSources: Readonly<Record<string, string>>;
}): Promise<PyodideEntryModule> => {
  const { config } = options;
  const pyodide = await options.loadPyodide({ indexURL: config.indexURL });
  await pyodide.loadPackage([...config.distributionPackages, "micropip"]);
  const requirements = JSON.stringify(micropipRequirements(config));
  await pyodide.runPythonAsync(
    `import micropip\nawait micropip.install(${requirements}, deps=False)`,
  );
  writePythonSources(pyodide, options.pythonSources);
  const root = JSON.stringify(pythonSourceRoot);
  await pyodide.runPythonAsync(
    `import sys\nif ${root} not in sys.path:\n    sys.path.insert(0, ${root})`,
  );
  return pyodide.pyimport(
    "petrinaut_optimizer_core.pyodide_entry",
  ) as PyodideEntryModule;
};

export const createOptimizerStudyRunner = (options: {
  loadPyodide: LoadPyodide;
  config: OptimizerPyodideConfig;
  pythonSources: Readonly<Record<string, string>>;
}): OptimizerStudyRunner => {
  const entry = loadOptimizerEntry(options);
  const ready = entry.then(() => undefined);
  let queue: Promise<unknown> = ready;

  const runStudy = async (
    input: OptimizerStudyRunInput,
  ): Promise<OptimizerStudySummary> => {
    const module = await entry;
    // Optuna numbers an in-memory study's trials densely from 0 in ask order,
    // so the evaluate call count is the trial number.
    let nextTrial = 0;
    const evaluate = (values: unknown): Promise<PythonTrialOutcome> => {
      // Argument proxies are destroyed when this call returns: convert before
      // the first await.
      const suggestedValues = asParameters(toJsValue(values));
      const trial = nextTrial;
      nextTrial += 1;
      return input.evaluate(trial, suggestedValues).then(toPythonOutcome);
    };
    const onTrial = (payload: unknown): void => {
      input.onTrial(normalizeTrialPayload(toJsValue(payload)));
    };
    const result = await module.run_browser_study(
      JSON.stringify(input.description),
      evaluate,
      onTrial,
      () => input.isCancelled(),
    );
    const summary = normalizeSummary(toJsValue(result));
    if (isPyProxyLike(result)) {
      result.destroy();
    }
    return summary;
  };

  return {
    ready,
    run(input) {
      const result = queue.then(() => runStudy(input));
      queue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
};
