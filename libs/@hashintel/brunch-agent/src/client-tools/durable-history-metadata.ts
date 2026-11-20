/**
 * The metadata the durable agents server's history (`GET /chat/:id/messages`)
 * sets on a message, for a panel that reopens a conversation: how a
 * response's turn ended, an input that never ran, and an input that told the
 * model of a version load. `stopped` and `failed` are the panel's own
 * terminal markers (`PetrinautAiMessageMetadata`), so its reads of them work
 * on a reopened response as on a live one.
 */

import * as v from "valibot";

export const durableHistoryMessageMetadataSchema = v.object({
  /** A response whose turn was stopped. */
  stopped: v.optional(v.literal(true)),
  /** A response whose turn failed, a crash-loop abort included. */
  failed: v.optional(v.literal(true)),
  /**
   * A user's input that never ran, so has no response: withdrawn from the
   * queue because the run before it failed, or by a stop.
   */
  withdrawn: v.optional(v.picklist(["failed", "stopped"])),
  /** A user's input that carried a new version load, which its run told the model of. */
  versionLoad: v.optional(
    v.object({ id: v.string(), decisionTime: v.string() }),
  ),
});

export type DurableHistoryMessageMetadata = v.InferOutput<
  typeof durableHistoryMessageMetadataSchema
>;

export const parseDurableHistoryMessageMetadata = v.parser(
  durableHistoryMessageMetadataSchema,
);
