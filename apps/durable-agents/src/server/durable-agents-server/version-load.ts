/**
 * Fold 2c: HASH's version-load note. After the user loads another saved
 * version, the next input the panel sends carries that load in its submission
 * context, and the model reads, once, which version later saves build on.
 *
 * The conversation's `brunch.version-load` document records the load last
 * announced. Admission reads it in the admitting commit: an input whose load
 * differs gains the note before its content, and the document records the
 * load, so later inputs carrying the same load gain none. The entry's
 * `data.userText` keeps the user's bare words.
 *
 * Brunch on Flue derives the note from the visible entries on every request,
 * so a compaction that summarized the announcing turn away announced again;
 * here the note is stored once, where the load happened.
 */
import {
  defineDoc,
  type ConversationId,
  type Tx,
} from "@earendil-works/pi-durable";

import { versionLoadNote } from "@hashintel/brunch-agent";

import type { ChatInput } from "./user-input";

/** The saved version whose load the model was last told of, by its ID. */
export const VersionLoadDoc = defineDoc<{ announced?: string }>({
  kind: "brunch.version-load",
  version: 1,
  scope: "conversation",
  history: "latest",
  // A fork continues the same editor, so it has been told what its source was.
  fork: "current",
  initial: () => ({}),
  checkpointWhen: () => false,
});

/**
 * The content `input` is admitted with: its own, or prefixed with the
 * version-load note when it carries a load the conversation was not yet told
 * of, which the document then records. Call it only in the commit that
 * admits `input`, and only for a new admission.
 */
export const contentWithVersionLoadNote = async (
  tx: Tx,
  conversationId: ConversationId,
  { content, versionLoad }: ChatInput,
): Promise<string> => {
  if (versionLoad === undefined) return content;
  const document = await tx.doc(VersionLoadDoc, conversationId);
  if (document.announced === versionLoad.id) return content;
  document.announced = versionLoad.id;
  return `${versionLoadNote(versionLoad)}\n\n${content}`;
};
