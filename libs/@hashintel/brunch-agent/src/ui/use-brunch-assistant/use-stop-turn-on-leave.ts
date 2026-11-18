import { useEffect, useRef } from "react";

import { requestFlueStop } from "../../client/request-flue-stop";

import type { BrunchPanelConversationTracker } from "../../client/brunch-panel-transport";
import type { FlueClient, FlueConversationState } from "@flue/sdk";

type SentSession = {
  readonly client: Promise<FlueClient> | null;
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
 * nothing.
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
      const { client, tracker, snapshot } = committed.current;
      if (client === null || !tracker.hasUnsettledTurn(snapshot)) return;
      // Flue's abort is conversation-wide, so a send pending at leave that
      // the agent then refuses must not stop another tab's turn.
      tracker
        .hasUnsettledTurnAfterSettling(snapshot)
        .then((unsettled) =>
          unsettled ? requestFlueStop(client, tracker) : undefined,
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
