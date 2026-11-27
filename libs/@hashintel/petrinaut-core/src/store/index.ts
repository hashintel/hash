/**
 * @layerRoot core.store
 * @role The two subscribable primitives Core exposes instead of a framework dependency: a store that holds a current value and an event stream that holds none
 */

export type { EventStream } from "./event-stream";
export { createReadableStore, type ReadableStore } from "./readable-store";
