/**
 * Active Flue adapters for conversation history, reply projection, and the
 * local capture store. The generalized typed elicitation hook is retained
 * under `suspended/` but deliberately absent from this public surface.
 */

export { CAPABILITIES, type Capability, type Provision } from "./capabilities";
export {
  createFlueHistoryReader,
  projectFlueHistoryForSweep,
  type FlueHistoryReaderOptions,
} from "./history-reader";
export {
  createFlueReplyProjector,
  type FlueReplyProjector,
  type FlueReplyProjectorOptions,
} from "./reply-projector";
export { createLocalCaptureStore } from "./local-capture-store";
