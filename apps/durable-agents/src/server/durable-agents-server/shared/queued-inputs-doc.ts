/**
 * The document of a conversation's inputs admitted while queued, so the
 * history can show one that was withdrawn before it ran. Pi keeps a queued
 * input's content only in its inbox item, which withdrawal deletes, and a
 * withdrawn input has no entry. Admission records each input it finds still
 * queued, and drops each record whose input has since been placed, so the
 * document holds the queued and the withdrawn.
 */
import {
  defineDoc,
  type JsonObject,
  type SubmissionId,
} from "@earendil-works/pi-durable";

import type { ChatInput } from "../user-input";

/** An input as `POST /chat` admitted it: the entry it would be placed as, and the content the model would read. */
export type QueuedInput = {
  readonly submission: SubmissionId;
  readonly requestId: string;
  readonly kind: ChatInput["entry"]["kind"];
  readonly data: JsonObject;
  readonly content: ChatInput["content"];
};

/** Queued and withdrawn inputs, in admission order, so in ascending submission order. */
export const QueuedInputsDoc = defineDoc<{ inputs: QueuedInput[] }>({
  kind: "durable-agents.queued-inputs",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "current",
  initial: () => ({ inputs: [] }),
  checkpointWhen: () => false,
});
