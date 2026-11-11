/**
 * The HASH agent's Save: how it is described to the model, and what the model
 * is shown of its result; its input and outcome are shared with HASH's page
 * through `@hashintel/brunch-agent`. HASH's process page runs it through its
 * editor's own Save, once the user approves it on a card; this module never
 * reaches HASH.
 */

import { defineTool, type JsonValue } from "@flue/runtime";

import {
  brunchTools,
  vHashSaveInput,
  type HashSaveOutcome,
  parseHashSaveOutcome,
} from "@hashintel/brunch-agent";

import { BrowserCallNotStartedError } from "../../../shared/conversation/browser-call-rendezvous.ts";
import {
  type BrowserToolExecutor,
  browserResultEnvelope,
} from "../../../shared/conversation/browser-tool-executor.ts";

/** What the model is told whenever a save may or may not have written a version. */
export const hashSaveUnconfirmedNote = `The save is not confirmed: a version may or may not have been written. Tell the user, who can check the version list, and don't call ${brunchTools.appSaveNet} again until they ask.`;

export const hashSaveDescription = (documentId: string) =>
  `Save the net open in the editor to HASH as a new version, exactly as the editor's Save button does; others who can see the net then see that version. The net open in the editor is documentId ${JSON.stringify(documentId)}. Call it only when the user asks for a save or agrees to one you offered. The user approves each save on a card; it saves the net as the editor holds it then, with every unsaved edit, the user's and yours. It saves only the net: this conversation and its Ledger stay in Brunch and are not saved into HASH. Returns { saved: true, decisionTime, title, stillDirty } when saved: decisionTime is the saved version's time, and stillDirty means edits made since are not in it. Returns { saved: false, error, note } when the page could not confirm the save, and fails with an error carrying the same note when the page's answer was lost: ${hashSaveUnconfirmedNote} Returns { saved: false, reason } when it did not start (the user declined, the net is read-only or unsaved, it has no unsaved changes, a save is already in progress, or it isn't the open net): nothing was saved. If it is refused because the document changed since your last view of the net, read the net, then call it again.`;

const outcomeOf = (output: unknown): HashSaveOutcome => {
  try {
    return parseHashSaveOutcome(output);
  } catch (error) {
    throw new Error("HASH's page returned a save in an unknown shape.", {
      cause: error,
    });
  }
};

/** What the model is shown of a settled save. */
export const hashSaveForModel = (output: unknown): JsonValue => {
  const outcome = outcomeOf(output);
  switch (outcome.status) {
    case "saved":
      return {
        saved: true,
        decisionTime: outcome.decisionTime,
        title: outcome.title,
        stillDirty: outcome.stillDirty,
      };
    case "unconfirmed":
      return {
        saved: false,
        error: outcome.error,
        note: hashSaveUnconfirmedNote,
      };
    case "not-started":
      return { saved: false, reason: outcome.reason };
  }
};

/** The save of the bound net, executed by whatever `execute` reaches HASH through. */
export const createHashPetrinautSaveTool = (
  execute: BrowserToolExecutor,
  documentId: string,
) =>
  defineTool({
    name: brunchTools.appSaveNet,
    description: hashSaveDescription(documentId),
    input: vHashSaveInput,
    run: async ({ data, toolCallId, signal }) => {
      try {
        const result = await execute({
          toolName: brunchTools.appSaveNet,
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
        // A save never issued to, or never started by, the page wrote nothing.
        // Any other failure, an answer in an unknown shape included, may have
        // followed a save the page started.
        if (error instanceof BrowserCallNotStartedError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${message} ${hashSaveUnconfirmedNote}`, {
          cause: error,
        });
      }
    },
  });
