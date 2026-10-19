import {
  ledgerCommentsMessage,
  type LedgerComment,
} from "@hashintel/brunch-agent";

import type { PetrinautAiComposerControlContext } from "../chat/ai-assistant-composer-control";

export type PendingCommentsState = {
  /** Comments the user has written but not yet sent to Brunch. */
  readonly comments: readonly LedgerComment[];
  readonly sending: "idle" | "pending" | "failed";
};

const commentNumber = (id: string) => Number(id.slice(1));

const createPendingComments = () => {
  let state: PendingCommentsState = { comments: [], sending: "idle" };
  // IDs are never reused, even for a comment discarded before it was sent.
  let highestIssued = 0;
  const listeners = new Set<() => void>();
  const publish = (next: PendingCommentsState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: (): PendingCommentsState => state,
    /** `sentIds` are the comments the conversation already holds. */
    add: (
      comment: Omit<LedgerComment, "id">,
      sentIds: readonly string[],
    ): LedgerComment => {
      highestIssued =
        Math.max(highestIssued, ...sentIds.map(commentNumber)) + 1;
      const added = { id: `n${highestIssued}`, ...comment };
      publish({ ...state, comments: [...state.comments, added] });
      return added;
    },
    edit: (id: string, text: string) =>
      publish({
        ...state,
        comments: state.comments.map((comment) =>
          comment.id === id ? { ...comment, text } : comment,
        ),
      }),
    remove: (id: string) =>
      publish({
        ...state,
        comments: state.comments.filter((comment) => comment.id !== id),
      }),
    discard: () => publish({ comments: [], sending: "idle" }),
    /** Sends every pending comment as one turn; comments added meanwhile stay pending. */
    send: (submitText: PetrinautAiComposerControlContext["submitText"]) => {
      const sent = state.comments;
      if (state.sending === "pending" || sent.length === 0) return;
      publish({ ...state, sending: "pending" });
      const sentIds = new Set(sent.map(({ id }) => id));
      void submitText({
        target: "message",
        preserveDraft: true,
        text: ledgerCommentsMessage(sent).body,
      }).then(
        () =>
          publish({
            comments: state.comments.filter(({ id }) => !sentIds.has(id)),
            sending: "idle",
          }),
        () => publish({ ...state, sending: "failed" }),
      );
    },
  };
};

export type PendingComments = ReturnType<typeof createPendingComments>;

// Keyed like the experiment drafts: on the Brunch plugin's
// `api.document.net`, so the Ledger tab and the composer bar share one store
// per editor, and it is released with that editor.
const editors = new WeakMap<object, PendingComments>();
export const pendingCommentsFor = (definitionStore: object) => {
  let comments = editors.get(definitionStore);
  if (!comments) {
    comments = createPendingComments();
    editors.set(definitionStore, comments);
  }
  return comments;
};
