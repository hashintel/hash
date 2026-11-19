/**
 * Fold 2c: HASH's version load. After the user loads another saved version,
 * every input the panel sends carries that load in its submission context, and
 * the model reads which version later saves build on from the `version_load`
 * prompt section (`agent/hash-agent/version-load-section.ts`).
 *
 * Admission records the load in the conversation's `VersionLoadsDoc`, in the
 * commit that admits the input, keyed by the submission it creates, when it
 * differs from the newest load recorded; an input carrying the same load
 * records nothing. The section renders from that document, so the load shows
 * once, as a system delta in the run of the input that carried it, and every
 * baseline after a compaction restates it. The content is the user's own; the
 * entry's `data.userText` keeps their bare words.
 *
 * Conversations admitted before the section kept the load last announced in
 * `brunch.version-load` and put the note in the input's content. Until such a
 * conversation records a load of its own, that document stands in for the
 * newest load, so a load it already announced is not recorded again.
 *
 * Brunch on Flue derives a per-turn note from the visible entries on every
 * request, so a compaction that summarized the announcing turn away
 * announced again.
 */
import {
  type ConversationId,
  defineDoc,
  type DocumentReader,
  type SubmissionId,
  type Tx,
} from "@earendil-works/pi-durable";

import { VersionLoadsDoc } from "../../agent/hash-agent/version-load-section";

import type { ChatInput } from "./user-input";
import type { Context } from "@earendil-works/chord/context";

/**
 * The saved version a conversation admitted before the section was told of,
 * by its ID. No longer written; its history and fork policy can't change, so
 * the section's document is a new kind.
 */
export const AnnouncedVersionLoadDoc = defineDoc<{ announced?: string }>({
  kind: "brunch.version-load",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "current",
  initial: () => ({}),
  checkpointWhen: () => false,
});

/** Records `input`'s load, if new, in the commit that admits it. */
export type VersionLoadRecorder = (
  tx: Tx,
  submission: SubmissionId,
) => Promise<void>;

/**
 * The recorder for `input` in `conversationId`. Call it before the admitting
 * commit, which reads documents only through its `tx`, and call what it
 * returns in that commit, with the submission the commit creates, and only
 * for a new admission.
 */
export const versionLoadRecorder = async (
  read: DocumentReader,
  conversationId: ConversationId,
  { versionLoad }: ChatInput,
  context: Context,
): Promise<VersionLoadRecorder> => {
  if (versionLoad === undefined) return async () => {};
  const announced = (
    await read.snapshot(AnnouncedVersionLoadDoc, conversationId, context)
  )?.announced;
  return async (tx, submission) => {
    const document = await tx.doc(VersionLoadsDoc, conversationId);
    const newest = document.loads.at(-1)?.id ?? announced;
    if (newest === versionLoad.id) return;
    document.loads.push({
      id: versionLoad.id,
      decisionTime: versionLoad.decisionTime,
      submission,
    });
  };
};
