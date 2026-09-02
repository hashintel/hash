/**
 * Spawning simulation workers under Node.
 *
 * The core's experiment runtime asks for a {@link WorkerFactory} and speaks a
 * structural `WorkerLike` — `postMessage`, `addEventListener` receiving a
 * `{ data }` envelope, `terminate` — so Node's `worker_threads.Worker`, which
 * emits bare values through `.on("message", ...)`, is adapted here.
 *
 * The worker entry is a sibling bundle of `cli.js`, so it exists when the CLI
 * runs from its build output. Running from source (`tsx src/cli.ts`) has no
 * such file: the factory then falls back to the in-process worker, which runs
 * the same protocol on the calling thread, and says so once on stderr so a
 * sequential dev run is never mistaken for a parallel one.
 */
import { existsSync } from "node:fs";
import { Worker } from "node:worker_threads";

import { createInProcessMonteCarloWorker } from "@hashintel/petrinaut-core/workers/monte-carlo";

import type { WorkerFactory } from "@hashintel/petrinaut-core";

const workerEntryUrl = new URL("./simulation-worker.js", import.meta.url);

let warnedAboutFallback = false;

export function createNodeSimulationWorkerFactory(options?: {
  /** Overrides the entry bundle, e.g. for tests. */
  entryUrl?: URL;
  errorOutput?: { write: (chunk: string) => void };
}): WorkerFactory {
  const entryUrl = options?.entryUrl ?? workerEntryUrl;

  if (!existsSync(entryUrl)) {
    if (!warnedAboutFallback) {
      warnedAboutFallback = true;
      options?.errorOutput?.write(
        `Simulation worker bundle not found at ${entryUrl.pathname}; runs execute in-process\n`,
      );
    }
    return createInProcessMonteCarloWorker;
  }

  return () => {
    // The worker stays referenced: the trial that asked for it disposes the
    // experiment in a `finally`, which terminates every worker, so the process
    // neither exits before a reply is written nor outlives the request.
    const worker = new Worker(entryUrl);

    return {
      postMessage: (message) => {
        worker.postMessage(message);
      },
      addEventListener: (_type, listener) => {
        worker.on("message", (data: unknown) => {
          listener({ data });
        });
      },
      terminate: () => {
        void worker.terminate();
      },
    };
  };
}
