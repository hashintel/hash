/**
 * The Save that HASH's process page runs for Brunch's HASH agent, through its
 * editor's own Save, once the person approves it: its input, and the outcome
 * the page settles it with.
 */

import * as v from "valibot";

export const hashSaveInputSchema = v.strictObject({
  documentId: v.pipe(
    v.string(),
    v.minLength(1),
    v.description(
      "The ID of the net open in the editor, given in this tool's description.",
    ),
  ),
});

export type HashSaveInput = v.InferOutput<typeof hashSaveInputSchema>;

export const parseHashSaveInput = (input: unknown): HashSaveInput =>
  v.parse(hashSaveInputSchema, input);

const hashSaveOutcomeSchema = v.variant("status", [
  v.object({
    status: v.literal("saved"),
    /** The saved version's time, as the editor's save result gives it. */
    decisionTime: v.nullable(v.string()),
    title: v.string(),
    /** The editor still has edits the saved version doesn't include. */
    stillDirty: v.boolean(),
  }),
  /** The page could not confirm the save: a version may or may not have been written. */
  v.object({ status: v.literal("unconfirmed"), error: v.string() }),
  /** Refused by the page or declined by the person before anything was sent: nothing was saved. */
  v.object({ status: v.literal("not-started"), reason: v.string() }),
]);

/** What a save settles with in the page. */
export type HashSaveOutcome = v.InferOutput<typeof hashSaveOutcomeSchema>;

/** Throws on anything but a save's outcome. */
export const parseHashSaveOutcome = (value: unknown): HashSaveOutcome =>
  v.parse(hashSaveOutcomeSchema, value);
