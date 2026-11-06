import type {
  ConversationView,
  SubmissionRecord,
} from "@earendil-works/pi-durable";

/**
 * One server-sent frame of a followed submission: the conversation's whole
 * committed view at one commit, and the submission's record read after it.
 * Spike wire format: whole views, not Chord ops.
 */
export type ChatFrame = {
  readonly submission: SubmissionRecord;
  readonly view: ConversationView;
};

export type SubmitBody = {
  readonly requestId: string;
  readonly content: string;
};
