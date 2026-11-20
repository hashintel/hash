import { useEffect, useRef } from "react";

import type { BrunchPanelConversationTracker } from "../../client/brunch-panel-transport";
import type { FlueConversationState } from "@flue/sdk";

type SentSession = {
  /**
   * Stops the conversation's turn once its in-flight sends settle, unless
   * `stillWanted` then says otherwise; `null` while there is no session.
   */
  readonly stop: ((stillWanted: () => boolean) => Promise<unknown>) | null;
  readonly tracker: BrunchPanelConversationTracker;
  readonly snapshot: FlueConversationState | undefined;
};

/**
 * A turn's browser actions run only in the editor lifetime that sent it, so
 * when the editor handle or the binding changes, or the host unmounts, stop
 * the turn the leaving session sent, if it is still running by its own
 * tracker and the conversation's latest snapshot.
 *
 * A session recreated for another reason (a new `fetch`, actor key or chat
 * endpoint) with the same handle and binding is not a leave, and stops
 * nothing. A message sent after the leave withdraws the stop: the leaving
 * turn's browser actions cannot reach the new editor, so the new message wins.
 */
export const useStopTurnOnLeave = ({
  editorHandle,
  binding,
  session,
  onError,
}: {
  /**
   * The editor lifetime: its document handle, or `null` while none is open.
   * Compared by identity only, so any type will do.
   */
  readonly editorHandle: unknown;
  /**
   * The binding the conversation's session serves. Compared by identity only,
   * so any type will do.
   */
  readonly binding: unknown;
  readonly session: SentSession;
  readonly onError: (error: unknown) => void;
}): void => {
  // The session committed last. React runs every passive cleanup in a commit
  // before any passive setup, so the cleanup below still reads the leaving
  // session; the effect after it then records the arriving one.
  const committed = useRef(session);
  const reportError = useRef(onError);

  useEffect(
    () => () => {
      const { stop, tracker, snapshot } = committed.current;
      if (stop === null || !tracker.hasUnsettledTurn(snapshot)) return;
      // A stop is conversation-wide, so a send pending at leave that the
      // agent then refuses must not stop another tab's turn, and a message
      // the next editor sends through this same session (the binding
      // unchanged) before the abort lands must not be stopped with it.
      const sentAtLeave = tracker.trackedSubmissionCount;
      const nothingSentSince = () =>
        tracker.trackedSubmissionCount === sentAtLeave;
      tracker
        .hasUnsettledTurnAfterSettling(snapshot)
        .then((unsettled) =>
          unsettled && nothingSentSince() ? stop(nothingSentSince) : undefined,
        )
        .catch((error: unknown) => reportError.current(error));
    },
    [editorHandle, binding],
  );

  useEffect(() => {
    committed.current = session;
    reportError.current = onError;
  });
};
