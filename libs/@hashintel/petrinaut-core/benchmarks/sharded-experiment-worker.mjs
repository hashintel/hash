/**
 * Node worker entry for `sharded-experiment.mjs`.
 *
 * The shipped Monte Carlo worker is written against the browser worker global
 * scope, so under `node:worker_threads` its `self`-style message plumbing is
 * bridged to `parentPort` before importing it.
 *
 * The `dist` build wraps the worker in an inline Blob for the browser, which
 * Node cannot import, so `sharded-experiment.mjs` bundles the worker source for
 * Node first and this file loads that bundle.
 */
import { parentPort } from "node:worker_threads";

const listeners = new Set();

globalThis.self = {
  postMessage: (message) => parentPort.postMessage(message),
  addEventListener: (type, listener) => {
    if (type === "message") {
      listeners.add(listener);
    }
  },
  removeEventListener: (type, listener) => {
    if (type === "message") {
      listeners.delete(listener);
    }
  },
};
globalThis.postMessage = globalThis.self.postMessage;
globalThis.addEventListener = globalThis.self.addEventListener;
globalThis.removeEventListener = globalThis.self.removeEventListener;

parentPort.on("message", (data) => {
  for (const listener of listeners) {
    listener({ data });
  }
});

await import("./.node-worker-bundle.mjs");
