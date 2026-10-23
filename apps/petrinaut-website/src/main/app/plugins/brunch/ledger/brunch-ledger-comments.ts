import {
  ledgerCommentsMessage,
  type LedgerComment,
} from "@hashintel/brunch-agent";
import { FlueChatAdmissionError } from "@local/flue-aisdk-transport";

import type { PetrinautAiComposerControlContext } from "../chat/ai-assistant-composer-control";

export type PendingCommentsState = {
  /** Comments the user has written but not yet admitted to Brunch. */
  readonly comments: readonly LedgerComment[];
  readonly sending: "idle" | "pending" | "failed" | "uncertain";
};

const createPendingComments = () => {
  let state: PendingCommentsState = { comments: [], sending: "idle" };
  // An ambiguous POST is retried with its original delivery key and payload.
  let attempt: { id: string; comments: readonly LedgerComment[] } | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: PendingCommentsState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const locked = () =>
    state.sending === "pending" || state.sending === "uncertain";
  return {
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: (): PendingCommentsState => state,
    add: (comment: Omit<LedgerComment, "id">): LedgerComment => {
      const added = { ...comment, id: `n-${crypto.randomUUID()}` };
      publish({ ...state, comments: [...state.comments, added] });
      return added;
    },
    edit: (id: string, text: string) => {
      if (locked()) return;
      publish({
        ...state,
        comments: state.comments.map((comment) =>
          comment.id === id ? { ...comment, text } : comment,
        ),
      });
    },
    remove: (id: string) => {
      if (locked()) return;
      publish({
        ...state,
        comments: state.comments.filter((comment) => comment.id !== id),
      });
    },
    discard: () => {
      if (locked()) return;
      attempt = undefined;
      publish({ comments: [], sending: "idle" });
    },
    /** `submitText` must settle on admission, not on the SDK response stream. */
    send: (submitText: PetrinautAiComposerControlContext["submitText"]) => {
      if (state.sending === "pending" || state.comments.length === 0) return;
      if (attempt === undefined) {
        if (state.comments.some(({ text }) => text.trim() === "")) return;
        attempt = {
          id: crypto.randomUUID(),
          comments: state.comments.map((comment) => ({
            ...comment,
            text: comment.text.trim(),
          })),
        };
      }
      const sent = attempt;
      publish({ ...state, sending: "pending" });
      const sentIds = new Set(sent.comments.map(({ id }) => id));
      void submitText({
        id: sent.id,
        target: "message",
        preserveDraft: true,
        text: ledgerCommentsMessage(sent.comments).body,
      }).then(
        () => {
          attempt = undefined;
          publish({
            comments: state.comments.filter(({ id }) => !sentIds.has(id)),
            sending: "idle",
          });
        },
        (error: unknown) => {
          const uncertain =
            error instanceof FlueChatAdmissionError &&
            error.failure.kind !== "rejected";
          if (!uncertain) attempt = undefined;
          publish({ ...state, sending: uncertain ? "uncertain" : "failed" });
        },
      );
    },
  };
};

export type PendingComments = ReturnType<typeof createPendingComments>;

// Both surfaces share a store per editor AND conversation: record addresses
// have meaning only in that conversation, even when Clear chat keeps the net.
const editors = new WeakMap<object, Map<string, PendingComments>>();
export const pendingCommentsFor = (
  definitionStore: object,
  conversationId: string,
) => {
  let conversations = editors.get(definitionStore);
  if (conversations === undefined) {
    conversations = new Map();
    editors.set(definitionStore, conversations);
  }
  let comments = conversations.get(conversationId);
  if (comments === undefined) {
    comments = createPendingComments();
    conversations.set(conversationId, comments);
  }
  return comments;
};
