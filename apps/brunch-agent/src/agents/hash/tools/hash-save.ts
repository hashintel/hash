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
  BROWSER_CALL_STALE_ERROR,
  BROWSER_CALL_UNSTARTED_ERROR,
} from "../../../shared/conversation/browser-call-rendezvous.ts";
import {
  type BrowserToolExecutor,
  browserResultEnvelope,
} from "../../../shared/conversation/browser-tool-executor.ts";
import { noNetViewRefusal } from "../../../shared/conversation/net-freshness.ts";

/**
 * No defaults or transforms: the browser compares the input it was issued
 * with the model's call as it is.
 */
export const vHashSaveInput = v.strictObject({
  documentId: v.pipe(
    v.string(),
    v.minLength(1),
    v.description(
      "The ID of the net open in the editor, given in this tool's description.",
    ),
  ),
});

/** What the model is told whenever a save may or may not have written a version. */
export const hashSaveUnconfirmedNote = `The save is not confirmed: a version may or may not have been written. Tell the user, who can check the version list, and don't call ${brunchTools.saveHashNet} again until they ask.`;

export const hashSaveDescription = (documentId: string) =>
  `Save the net open in the editor to HASH as a new version, exactly as the editor's Save button does; others who can see the net then see that version. The net open in the editor is documentId ${JSON.stringify(documentId)}. Call it only when the user asks for a save or agrees to one you offered. The user approves each save on a card; it saves the net as the editor holds it then, with every unsaved edit, the user's and yours. It saves only the net: this conversation and its Ledger stay in Brunch and are not saved into HASH. Returns { saved: true, decisionTime, title, stillDirty } when saved: decisionTime is the saved version's time, and stillDirty means edits made since are not in it. Returns { saved: false, error, note } when the page could not confirm the save, and fails with an error carrying the same note when the page's answer was lost: ${hashSaveUnconfirmedNote} Returns { saved: false, reason } when it did not start (the user declined, the net is read-only or unsaved, it has no unsaved changes, a save is already in progress, or it isn't the open net): nothing was saved. If it is refused because the document changed since your last view of the net, read the net, then call it again.`;

const vSaved = v.object({
  saved: v.literal(true),
  decisionTime: v.nullable(v.string()),
  title: v.string(),
  stillDirty: v.boolean(),
});
const vUnconfirmed = v.object({
  saved: v.literal(false),
  error: v.string(),
});
/** A save the page refused or the user declined, before anything was sent. */
const vNotStarted = v.object({
  applied: v.literal(false),
  reason: v.string(),
});

/** What the model is shown of a settled save. */
export const hashSaveForModel = (output: unknown) => {
  const saved = v.safeParse(vSaved, output);
  if (saved.success) return saved.output;
  const unconfirmed = v.safeParse(vUnconfirmed, output);
  if (unconfirmed.success)
    return { ...unconfirmed.output, note: hashSaveUnconfirmedNote };
  const notStarted = v.safeParse(vNotStarted, output);
  if (notStarted.success)
    return { saved: false, reason: notStarted.output.reason };
  throw new Error("HASH's page returned a save in an unknown shape.");
};

/**
 * Failures of the executor that guarantee the save was never issued to, or
 * never claimed by, the browser. Any other failure, an answer in an unknown
 * shape included, may have followed a save the page started.
 */
const notStartedFailures: ReadonlySet<string> = new Set([
  noNetViewRefusal,
  BROWSER_CALL_STALE_ERROR,
  BROWSER_CALL_UNSTARTED_ERROR,
]);

/** The save of the bound net, executed by whatever `execute` reaches HASH through. */
export const createHashSaveTool = (
  execute: BrowserToolExecutor,
  documentId: string,
) =>
  defineTool({
    name: brunchTools.saveHashNet,
    description: hashSaveDescription(documentId),
    input: vHashSaveInput,
    run: async ({ data, toolCallId, signal }) => {
      try {
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
      } catch (error) {
        if (error instanceof Error && notStartedFailures.has(error.message))
          throw error;
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${message} ${hashSaveUnconfirmedNote}`, {
          cause: error,
        });
      }
    },
  });
