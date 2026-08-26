/**
 * Node `worker_threads` entry for the Monte Carlo worker protocol.
 *
 * Built as its own bundle beside `cli.js`, spawned once per shard by
 * `node-simulation-worker.ts`. The protocol itself lives in the core's
 * `attachMonteCarloWorker`; this file only adapts `parentPort` to the runtime
 * shape it expects.
 */
import { parentPort } from "node:worker_threads";

import { attachMonteCarloWorker } from "@hashintel/petrinaut-core/workers/monte-carlo";

if (!parentPort) {
  throw new Error(
    "The simulation worker entry must run inside a worker thread",
  );
}
const port = parentPort;

attachMonteCarloWorker({
  postMessage: (message) => {
    port.postMessage(message);
  },
  onMessage: (listener) => {
    port.on("message", listener);
  },
  delay: (timeout) =>
    new Promise((resolve) => {
      setTimeout(() => resolve(undefined), timeout);
    }),
});
