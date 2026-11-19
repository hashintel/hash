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
 * Brunch on Flue derives a per-turn note from the visible entries on every
 * request, so a compaction that summarized the announcing turn away
 * announced again.
 */
import {
  type ConversationId,
  type SubmissionId,
  type Tx,
} from "@earendil-works/pi-durable";

import { VersionLoadsDoc } from "../../shared/version-loads-doc";

import type { ChatInput } from "./user-input";

/**
 * Record `input`'s load, if it differs from the newest one recorded, in the
 * commit that admits it, with the submission that commit creates. Call it
 * only for a new admission.
 */
export const recordVersionLoad = async (
  tx: Tx,
  conversationId: ConversationId,
  { versionLoad }: ChatInput,
  submission: SubmissionId,
): Promise<void> => {
  if (versionLoad === undefined) return;
  const document = await tx.doc(VersionLoadsDoc, conversationId);
  if (document.loads.at(-1)?.id === versionLoad.id) return;
  document.loads.push({
    id: versionLoad.id,
    decisionTime: versionLoad.decisionTime,
    submission,
  });
};
