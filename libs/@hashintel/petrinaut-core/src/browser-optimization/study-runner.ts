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
import type { LoadPyodide, PyodideLike, PyProxyLike } from "./pyodide-like";

export type OptimizerStudyCallbacks = {
  /** The segment began; `requestedTrials` is the study's cumulative total. */
  onStarted(requestedTrials: number): void;
  evaluate(
    trial: number,
    suggestedValues: Record<string, OptimizationScalar>,
  ): Promise<PetrinautOptimizationTrialOutcome>;
  onTrial(event: OptimizerTrialPayload): void;
  isCancelled(): boolean;
};

export type OptimizerStudyStartInput = {
  runId: string;
  description: PetrinautOptimizationDescribeResult;
  /** Trials kept in flight at once. */
  parallelism: number;
  callbacks: OptimizerStudyCallbacks;
};

export type OptimizerStudyExtendInput = {
  runId: string;
  trials: number;
  parallelism: number;
  callbacks: OptimizerStudyCallbacks;
};

export type OptimizerStudyRunner = {
  /** Settles once Pyodide, the packages and the optimizer sources are loaded. */
  readonly ready: Promise<void>;
  /**
   * Creates the study for `runId` and runs its first `description.study.trials`
   * trials. The segments of every study run one after another, in call order.
   */
  start(input: OptimizerStudyStartInput): Promise<OptimizerStudySummary>;
  /** Runs `trials` more on the kept study; the trial numbers continue. */
  extend(input: OptimizerStudyExtendInput): Promise<OptimizerStudySummary>;
  /** Drops the kept study once the segments queued before it have run. */
  release(runId: string): Promise<void>;
  /** Drops every kept study. */
  dispose(): Promise<void>;
};

/** The outcome shape `ask_tell.run_study` expects from its evaluate callback. */
type PythonTrialOutcome = { objective: number } | { pruned: string };

/** The Python `StudyHandle`; `requested` is the study's cumulative trial total. */
type StudyHandleProxy = PyProxyLike & { readonly requested: number };

type PyodideEntryModule = {
  create_browser_study(
    descriptionJson: string,
    parallelism: number,
  ): StudyHandleProxy;
  run_browser_study(
    handle: StudyHandleProxy,
    trials: number,
    evaluate: (values: unknown) => Promise<PythonTrialOutcome>,
    onTrial: (payload: unknown) => void,
    isCancelled: () => boolean,
    parallelism: number,
  ): Promise<unknown>;
  release_browser_study(handle: StudyHandleProxy): void;
};

type KeptStudy = {
  readonly handle: StudyHandleProxy;
  /**
   * Optuna numbers a study's trials densely in ask order and every ask leads
   * to one evaluate call, so the count of evaluate calls is the next trial's
   * number, across segments and across trials a stop left untold.
   */
  nextTrial: number;
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
  const studies = new Map<string, KeptStudy>();
  let queue: Promise<unknown> = ready;

  const enqueue = <T>(
    task: (module: PyodideEntryModule) => Promise<T>,
  ): Promise<T> => {
    const result = queue.then(() => entry).then(task);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const dropStudy = (module: PyodideEntryModule, runId: string): void => {
    const study = studies.get(runId);
    if (!study) {
      return;
    }
    studies.delete(runId);
    module.release_browser_study(study.handle);
    study.handle.destroy();
  };

  const runSegment = async (
    module: PyodideEntryModule,
    runId: string,
    trials: number,
    parallelism: number,
    callbacks: OptimizerStudyCallbacks,
  ): Promise<OptimizerStudySummary> => {
    const study = studies.get(runId);
    if (!study) {
      throw new Error(
        `Optimization study "${runId}" is not kept: it was released, failed or never started`,
      );
    }
    const evaluate = (values: unknown): Promise<PythonTrialOutcome> => {
      // Argument proxies are destroyed when this call returns: convert before
      // the first await.
      const suggestedValues = asParameters(toJsValue(values));
      const trial = study.nextTrial;
      study.nextTrial += 1;
      return callbacks.evaluate(trial, suggestedValues).then(toPythonOutcome);
    };
    const onTrial = (payload: unknown): void => {
      callbacks.onTrial(normalizeTrialPayload(toJsValue(payload)));
    };
    try {
      const pending = module.run_browser_study(
        study.handle,
        trials,
        evaluate,
        onTrial,
        () => callbacks.isCancelled(),
        parallelism,
      );
      callbacks.onStarted(study.handle.requested);
      const result = await pending;
      const summary = normalizeSummary(toJsValue(result));
      if (isPyProxyLike(result)) {
        result.destroy();
      }
      return summary;
    } catch (error) {
      // The run that owns a failed study ends as failed and never releases it.
      dropStudy(module, runId);
      throw error;
    }
  };

  return {
    ready,
    start(input) {
      return enqueue(async (module) => {
        if (studies.has(input.runId)) {
          throw new Error(`Optimization study "${input.runId}" already exists`);
        }
        studies.set(input.runId, {
          handle: module.create_browser_study(
            JSON.stringify(input.description),
            input.parallelism,
          ),
          nextTrial: 0,
        });
        return runSegment(
          module,
          input.runId,
          input.description.study.trials,
          input.parallelism,
          input.callbacks,
        );
      });
    },
    extend(input) {
      return enqueue(async (module) => {
        return runSegment(
          module,
          input.runId,
          input.trials,
          input.parallelism,
          input.callbacks,
        );
      });
    },
    release(runId) {
      return enqueue(async (module) => {
        dropStudy(module, runId);
      });
    },
    dispose() {
      return enqueue(async (module) => {
        for (const runId of studies.keys()) {
          dropStudy(module, runId);
        }
      });
    },
  };
};
