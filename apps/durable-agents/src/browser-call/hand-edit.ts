/**
 * A panel's report that the user edited the net by hand, admitted as a
 * stored `brunch.hand-edit` note the model reads (Lu's decision 3).
 *
 * The panel decides what counts: it reports only consequential edits, the
 * ones that move its semantic revision, and the server treats revisions as
 * opaque strings. Each report has its own identity, `<episode>:<seq>`:
 * a retry reuses it, and an edit that recurs after a later view comes under
 * a new episode, so de-duplication is by report, never by revision.
 *
 * The note is a host write with a user `model` message: idle, Pi places it
 * at once and starts no run; busy, it is queued and placed at the next
 * `postTools` or `final` boundary. `visibleNetView` reads it: the latest note
 * after the model's view makes the view stale when it names another revision.
 */
import {
  handEditEntryKind,
  renderHandEditNote,
} from "../net-state/visible-net-view";
import { BrowserBindingDoc } from "./browser-call";

import type { Context } from "@earendil-works/chord/context";
import type {
  ConversationId,
  Harness,
  SubmissionDraft,
  SubmissionId,
  SubmissionRecord,
} from "@earendil-works/pi-durable";
import type { HandEditReportBody } from "@hashintel/brunch-agent";

/** The note entry's `data`. */
export type HandEditData = {
  readonly episode: string;
  readonly reportId: string;
  readonly revision: string;
};

/** A report's identity: its episode and its position in it. */
export const handEditReportId = ({
  episode,
  seq,
}: Pick<HandEditReportBody, "episode" | "seq">): string => `${episode}:${seq}`;

/** The request ID a report's note is written under. */
export const handEditRequestId = (reportId: HandEditData["reportId"]) =>
  `${handEditEntryKind}:${reportId}`;

/** The note's write, under the report's request ID, so a retried report is admitted once. */
export const handEditWrite = (
  { episode, seq, revision }: HandEditReportBody,
  timestamp: number,
): SubmissionDraft => {
  const reportId = handEditReportId({ episode, seq });
  const data: HandEditData = { episode, reportId, revision };
  return {
    type: "write",
    requestId: handEditRequestId(reportId),
    entry: {
      kind: handEditEntryKind,
      data,
      model: [
        { role: "user", content: renderHandEditNote(revision), timestamp },
      ],
    },
  };
};

export type HandEditOutcome =
  | {
      readonly status: "admitted";
      readonly reportId: string;
      /** The note's submission; a retry of the same report returns the first one. */
      readonly submission: SubmissionId;
      /** `done` once placed, `queued` until the busy conversation's next boundary. */
      readonly placement: SubmissionRecord["status"];
    }
  /** The report's binding is not the conversation's, or the conversation is unbound. */
  | { readonly status: "wrong-binding" }
  | { readonly status: "unknown-conversation" };

/**
 * Admit `report` as a note in `conversationId`, after checking its binding
 * against `BrowserBindingDoc` in the same commit, as a claim checks its call's.
 */
export const reportHandEdit = async (
  harness: Harness,
  conversationId: ConversationId,
  report: HandEditReportBody,
  context: Context,
): Promise<HandEditOutcome> => {
  const conversation = await harness.conversation(conversationId, context);
  if (conversation === undefined) return { status: "unknown-conversation" };
  const submission = await harness.commit(
    async (tx): Promise<SubmissionId | undefined> => {
      const { binding } = await tx.doc(BrowserBindingDoc, conversationId);
      if (binding === null || binding !== report.binding) return undefined;
      return conversation.submit(tx, handEditWrite(report, Date.now()));
    },
    context,
  );
  if (submission === undefined) return { status: "wrong-binding" };
  const placement = await (
    await harness.submission(submission, context)
  )?.status(context);
  if (placement === undefined)
    throw new Error(`Submission ${submission} was not found.`);
  return {
    status: "admitted",
    reportId: handEditReportId(report),
    submission,
    placement: placement.status,
  };
};
