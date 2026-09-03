// eslint-disable-next-line import/default -- Vite resolves the `?worker&url` query to the bundled worker script's URL
import workerUrl from "./optimizer.worker.ts?worker&url";

import type { WorkerLike } from "../environment";
import type {
  OptimizerToMainMessage,
  OptimizerToWorkerMessage,
} from "./messages";

/** A worker's `error` event; a script that fails to load fires one without a message. */
export type OptimizerWorkerErrorEvent = { readonly message?: string };

export type OptimizerWorkerLike = WorkerLike<
  OptimizerToWorkerMessage,
  OptimizerToMainMessage
> & {
  addEventListener(
    type: "error",
    listener: (event: OptimizerWorkerErrorEvent) => void,
  ): void;
};

declare const Worker: new (
  scriptUrl: string,
  options: { type: "module" },
) => OptimizerWorkerLike;

/** Pyodide loads through a dynamic `import()`, which only a module worker can run. */
export const createOptimizerWorker = (): OptimizerWorkerLike =>
  new Worker(workerUrl, { type: "module" });
