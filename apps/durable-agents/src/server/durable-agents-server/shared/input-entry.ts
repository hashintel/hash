/**
 * Which stored entries are inputs: the entry each input submission is placed
 * as, which starts that submission's response. Pi places an input as a
 * `pi.user` entry unless the submission names its own kind; `POST /chat`
 * names `brunch.user` or `brunch.ledger-comments`. Pi marks no entry as an
 * input otherwise: a hand-edit note is a user message to the model too.
 */
import { type EntryRecord, UserEntry } from "@earendil-works/pi-durable";

import { brunchSignals } from "@hashintel/brunch-agent";

import { brunchUserKind } from "../../../shared/brunch-user-entry";

/** Entry kinds an input is placed as. */
const inputKinds: ReadonlySet<string> = new Set([
  UserEntry.kind,
  brunchUserKind,
  brunchSignals.ledgerComments,
]);

/** Whether `entry` is an input, the start of its submission's response. */
export const isInputEntry = (entry: Pick<EntryRecord, "kind">): boolean =>
  inputKinds.has(entry.kind);

/** What `POST /chat` adds to an input entry's data: the request ID it admitted the input under. */
export type InputRequest = {
  readonly requestId?: string;
};

/** The request ID an input entry keeps; none for one admitted otherwise than by `POST /chat`, such as an old `pi.user`. */
export const inputRequestId = (
  entry: Pick<EntryRecord, "data">,
): string | undefined => {
  const { data } = entry;
  return typeof data === "object" &&
    data !== null &&
    !Array.isArray(data) &&
    typeof data.requestId === "string"
    ? data.requestId
    : undefined;
};
