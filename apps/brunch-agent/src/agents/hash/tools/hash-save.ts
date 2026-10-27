/**
 * The contract of the HASH agent's Save: its name, the input the model gives
 * it, and what the model is shown of its result. HASH's process page runs it
 * through its editor's own Save, once the user approves it on a card; this
 * module never reaches HASH.
 */

import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import { brunchTools } from "@hashintel/brunch-agent";

import {
  type BrowserToolExecutor,
  browserResultEnvelope,
} from "../../../shared/petrinaut-tools/petrinaut-construction.ts";

/**
 * No defaults or transforms: the browser compares the input it was issued
 * with the model's call as it is.
 */
export const hashSaveInputSchema = v.strictObject({
  documentId: v.pipe(
    v.string(),
    v.minLength(1),
    v.description("The id of the net open in the editor, as given above."),
  ),
});

export const hashSaveDescription = (documentId: string) =>
  `Save the net open in the editor to HASH as a new version, exactly as the editor's Save button does; others who can see the net then see that version. The net open in the editor is documentId ${JSON.stringify(documentId)}. Call it only when the user asks for a save or agrees to one. The user approves each save on a card; it saves the net as the editor holds it then, the user's own unsaved edits included. It saves only the net: this conversation and its Ledger stay in Brunch and are not saved into HASH. Returns { saved: true, decisionTime, title, stillDirty } when saved: decisionTime is the saved version's time, and stillDirty means edits made since are not in it. Returns { saved: false, error } when the save is not confirmed: a version may or may not have been written, so tell the user and don't call it again until they ask. Returns { saved: false, reason } when it did not start (the user declined, the net is read-only or unsaved, a save is already in progress, or it isn't the open net): nothing was saved. If it is refused because the document changed since your last view of the net, read the net, then call it again.`;

const savedSchema = v.object({
  saved: v.literal(true),
  decisionTime: v.nullable(v.string()),
  title: v.string(),
  stillDirty: v.boolean(),
});
const unconfirmedSchema = v.object({
  saved: v.literal(false),
  error: v.string(),
});
/** A save the page refused or the user declined, before anything was sent. */
const notStartedSchema = v.object({
  applied: v.literal(false),
  reason: v.string(),
});

/** What the model is shown of a settled save. */
export const hashSaveForModel = (output: unknown) => {
  const saved = v.safeParse(savedSchema, output);
  if (saved.success) return saved.output;
  const unconfirmed = v.safeParse(unconfirmedSchema, output);
  if (unconfirmed.success)
    return {
      ...unconfirmed.output,
      note: "The save is not confirmed: a version may or may not have been written. Tell the user, who can check the version list, and don't call save_hash_net again until they ask.",
    };
  const notStarted = v.safeParse(notStartedSchema, output);
  if (notStarted.success)
    return {
      saved: false,
      reason: notStarted.output.reason,
      note: "The save did not start; nothing was saved.",
    };
  throw new Error("HASH's page returned a save in an unknown shape.");
};

/** The save of the bound net, executed by whatever `execute` reaches HASH through. */
export const createHashSaveTool = (
  execute: BrowserToolExecutor,
  documentId: string,
) =>
  defineTool({
    name: brunchTools.saveHashNet,
    description: hashSaveDescription(documentId),
    input: hashSaveInputSchema,
    run: async ({ data, toolCallId, signal }) => {
      const result = await execute({
        toolName: brunchTools.saveHashNet,
        input: data,
        toolCallId,
        signal,
      });
      return {
        output: browserResultEnvelope({
          ...result,
          output: hashSaveForModel(result.output),
        }),
        terminate: false,
      };
    },
  });
