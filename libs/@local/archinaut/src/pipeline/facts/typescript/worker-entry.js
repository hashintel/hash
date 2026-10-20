// The worker's sources are TypeScript like the rest of the tool; tsx compiles
// them on the fly here, as `bin/archinaut.js` does for the main thread.
import { tsImport } from "tsx/esm/api";

await tsImport("./worker.ts", import.meta.url);
