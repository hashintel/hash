/**
 * @layerRoot core.store
 * @layerName Readable store
 * @role Minimal subscribable store primitive the core exposes instead of a framework dependency
 * @invariant Framework-agnostic — consumers adapt it (for example via `useStore`) rather than the core importing React
 */

export { createReadableStore, type ReadableStore } from "./readable-store";
