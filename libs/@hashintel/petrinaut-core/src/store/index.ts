/**
 * @layerRoot core.store
 * @role Minimal subscribable store primitive the core exposes instead of a framework dependency
 */

export type { EventStream } from "./event-stream";
export { createReadableStore, type ReadableStore } from "./readable-store";
