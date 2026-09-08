/**
 * @layerRoot core.optimization.browser.worker
 * @role Hosts Optuna in Pyodide off the main thread and pairs each evaluate request with the study loop
 */
import { createWorkerThreadRuntime } from "../../../environment";
import { attachOptimizerWorker } from "./attach-optimizer-worker";
import { createOptimizerStudyRunner } from "./study-runner";

import type { LoadPyodide } from "./pyodide-like";

const ensureTrailingSlash = (url: string): string =>
  url.endsWith("/") ? url : `${url}/`;

const importLoadPyodide = async (indexURL: string): Promise<LoadPyodide> => {
  const module: unknown = await import(
    /* @vite-ignore */ `${indexURL}pyodide.mjs`
  );
  if (
    typeof module !== "object" ||
    module === null ||
    !("loadPyodide" in module) ||
    typeof module.loadPyodide !== "function"
  ) {
    throw new Error(`Pyodide at ${indexURL} exposes no loadPyodide`);
  }
  return module.loadPyodide as LoadPyodide;
};

attachOptimizerWorker(
  createWorkerThreadRuntime(),
  ({ pyodide, pythonSources }) => {
    const indexURL = ensureTrailingSlash(pyodide.indexURL);
    return createOptimizerStudyRunner({
      loadPyodide: async (options) =>
        (await importLoadPyodide(indexURL))(options),
      config: { ...pyodide, indexURL },
      pythonSources,
    });
  },
);
