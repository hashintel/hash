/**
 * Admission's record of a queued input, in `QueuedInputsDoc`: what the
 * history shows of an input withdrawn before it ran.
 */
import {
  type ConversationId,
  InboxDoc,
  type SubmissionId,
  type Tx,
} from "@earendil-works/pi-durable";

import { QueuedInputsDoc } from "./shared/queued-inputs-doc";

import type { ChatInput } from "./user-input";

/**
 * Read what recording needs, before the commit's first table write, and
 * return the recorder to call once `submit` has admitted `input`: it drops
 * the records of inputs since placed, and records `input` if it is queued.
 */
export const queuedInputRecorder = async (
  tx: Tx,
  conversationId: ConversationId,
) => {
  const recorded = (await tx.doc(QueuedInputsDoc, conversationId)).inputs;
  const submissions = await Promise.all(
    recorded.map(({ submission }) => tx.submission(submission)),
  );
  const placed = new Set(
    submissions.flatMap((submission) =>
      submission?.entry === undefined ? [] : [submission.id],
    ),
  );
  return async (
    input: ChatInput,
    requestId: string,
    submission: SubmissionId,
  ): Promise<void> => {
    const document = await tx.doc(QueuedInputsDoc, conversationId);
    if (placed.size > 0)
      document.inputs = document.inputs.filter(
        (record) => !placed.has(record.submission),
      );
    const inbox = await tx.doc(InboxDoc, conversationId);
    if (!inbox.items.some((item) => item.id === submission)) return;
    document.inputs.push({
      submission,
      requestId,
      kind: input.entry.kind,
      data: input.entry.data,
      content: input.content,
    });
  };
};
