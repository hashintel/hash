// Every worker thread starts here: the entry `startWorker` named is
// TypeScript, and tsx compiles it on the fly as `bin/archinaut.js` does for
// the main thread.
import { workerData } from "node:worker_threads";

import { tsImport } from "tsx/esm/api";

await tsImport(workerData.entry, import.meta.url);
