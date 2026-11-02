/**
 * The input of the Save that HASH's process page runs for Brunch's HASH agent,
 * through its editor's own Save, once the person approves it.
 */

import * as v from "valibot";

export const vHashSaveInput = v.strictObject({
  documentId: v.pipe(
    v.string(),
    v.minLength(1),
    v.description(
      "The ID of the net open in the editor, given in this tool's description.",
    ),
  ),
});

export type HashSaveInput = v.InferOutput<typeof vHashSaveInput>;

export const parseHashSaveInput = (input: unknown): HashSaveInput =>
  v.parse(vHashSaveInput, input);
