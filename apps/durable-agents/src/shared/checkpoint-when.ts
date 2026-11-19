/**
 * The `checkpointWhen` of a document that changes on every turn: Pi Durable
 * stores no base on its own, so a document that never checkpoints replays
 * every delta since its creation on each read.
 */
import type { CheckpointInfo } from "@earendil-works/pi-durable";

/** Store every `changes`-th change as a complete base, so a read replays at most `changes - 1` deltas. */
export const checkpointEvery =
  ({ changes }: { changes: number }) =>
  (_value: unknown, _ops: unknown, info: CheckpointInfo): boolean =>
    info.deltasSinceBase >= changes - 1;
