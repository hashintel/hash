/**
 * The Save that HASH's process page runs for Brunch's HASH agent, through its
 * editor's own Save, once the person approves it: its input, the outcome the
 * page settles it with, how Save is described to the model and what the model
 * is shown of its result, and the note the model reads when the person loads
 * another saved version.
 */

import * as v from "valibot";

import { brunchTools } from "../constants";

import type { VersionLoad } from "../petrinaut/submission-context";

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

const vHashSaveOutcome = v.variant("status", [
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
export type HashSaveOutcome = v.InferOutput<typeof vHashSaveOutcome>;

/** Throws on anything but a save's outcome. */
export const parseHashSaveOutcome = (value: unknown): HashSaveOutcome =>
  v.parse(vHashSaveOutcome, value);

/** What the model is told whenever a save may or may not have written a version. */
export const hashSaveUnconfirmedNote = `The save is not confirmed: a version may or may not have been written. Tell the user, who can check the version list, and don't call ${brunchTools.appSaveNet} again until they ask.`;

/** Save's description, naming the net open in the editor by `documentId`. */
export const hashSaveDescription = (documentId: string) =>
  `Save the net open in the editor to HASH as a new version, exactly as the editor's Save button does; others who can see the net then see that version. The net open in the editor is documentId ${JSON.stringify(documentId)}. Call it only when the user asks for a save or agrees to one you offered. The user approves each save on a card; it saves the net as the editor holds it then, with every unsaved edit, the user's and yours. It saves only the net: this conversation and its Ledger stay in Brunch and are not saved into HASH. Returns { saved: true, decisionTime, title, stillDirty } when saved: decisionTime is the saved version's time, and stillDirty means edits made since are not in it. Returns { saved: false, error, note } when the page could not confirm the save, and fails with an error carrying the same note when the page's answer was lost: ${hashSaveUnconfirmedNote} Returns { saved: false, reason } when it did not start (the user declined, the net is read-only or unsaved, it has no unsaved changes, a save is already in progress, or it isn't the open net): nothing was saved. If it is refused because the document changed since your last view of the net, read the net, then call it again.`;

/** What the model is shown of a settled save. */
export type HashSaveForModel =
  | {
      saved: true;
      decisionTime: string | null;
      title: string;
      stillDirty: boolean;
    }
  | { saved: false; error: string; note: string }
  | { saved: false; reason: string };

const outcomeOf = (output: unknown): HashSaveOutcome => {
  try {
    return parseHashSaveOutcome(output);
  } catch (error) {
    throw new Error("HASH's page returned a save in an unknown shape.", {
      cause: error,
    });
  }
};

/** What the model is shown of a settled save; throws on an unknown shape. */
export const hashSaveForModel = (output: unknown): HashSaveForModel => {
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

/** What the model reads on the turn after the user loaded another saved version. */
export const versionLoadNote = ({ decisionTime }: VersionLoad): string =>
  `Host note: The user loaded the version saved at ${decisionTime}; later saves build on it.`;
