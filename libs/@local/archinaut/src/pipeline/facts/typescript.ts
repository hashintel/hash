/**
 * TypeScript facts from the native compiler, hosted in a worker thread so
 * the main thread never blocks on it. Every covered TypeScript package goes
 * into one program, with `paths` mapping workspace packages to their source
 * entries so a cross-package reference lands on the defining source file.
 */

import { createRequire } from "node:module";

import { startWorker } from "../../shared/worker-channel";
import { workspacePaths } from "./typescript/workspace-paths";

import type { FactsOptions, FactsSource } from "../facts";
import type {
  TypeScriptRequest,
  TypeScriptResponse,
  TypeScriptWorkerData,
} from "./typescript/worker";

const require = createRequire(import.meta.url);

const typescriptVersion = (
  require("typescript-7/package.json") as { version: string }
).version;

/** Bumped whenever the walkers' output changes for the same input. */
const walkerVersion = 2;

/** What, besides the files, decides TypeScript facts. */
export const typeScriptSalt = (options: FactsOptions): string =>
  JSON.stringify({
    provider: "typescript",
    version: typescriptVersion,
    walker: walkerVersion,
    analysis: options.analysis,
    paths: workspacePaths(options.repoRoot, options.packages),
  });

export const openTypeScriptSource = (options: FactsOptions): FactsSource => {
  const workerData: TypeScriptWorkerData = {
    repoRoot: options.repoRoot,
    paths: workspacePaths(options.repoRoot, options.packages),
    analysis: options.analysis,
  };
  const worker = startWorker<TypeScriptRequest, TypeScriptResponse>(
    new URL("./typescript/worker-entry.js", import.meta.url),
    workerData,
  );
  const answer = async (request: TypeScriptRequest) => {
    const response = await worker.call(request);
    return { documents: response.documents, diagnostics: [] };
  };
  return {
    index: (files) => answer({ type: "index", files }),
    update: (files, changed) => answer({ type: "update", files, changed }),
    close: () => worker.close(),
  };
};
