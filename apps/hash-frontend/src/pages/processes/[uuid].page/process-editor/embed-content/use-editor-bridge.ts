import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  type HostToEditorMessage,
  type EditorToHostMessage,
  isHostToEditorMessage,
} from "../shared/messages";

type EditorBridgeHandlers = {
  onInit: (payload: Extract<HostToEditorMessage, { kind: "init" }>) => void;
  onLoad: (payload: Extract<HostToEditorMessage, { kind: "load" }>) => void;
  onSetReadonly?: (readonly: boolean) => void;
  onRevisionsList?: (
    revisions: Extract<
      HostToEditorMessage,
      { kind: "revisionsList" }
    >["revisions"],
  ) => void;
  onSaveResult: (
    payload: Extract<HostToEditorMessage, { kind: "saveResult" }>,
  ) => void;
};

type EditorBridge = {
  /** Send a message up to the host. */
  send: (message: EditorToHostMessage) => void;
};

/**
 * Editor-side companion to {@link useHostBridge}. The editor renders in the
 * host's page, so both sides post to this window.
 *
 * - Posts a `ready` message exactly once on mount so the host can push `init`.
 * - Listens for messages on `window` and dispatches them to the matching
 *   handler. Messages from any source other than this window are dropped, so
 *   another frame or window can't drive the bridge. Host and editor message
 *   kinds are disjoint, so the editor ignores its own messages.
 *
 * Like the host hook, handlers are stored in a ref so the listener doesn't
 * need to re-attach when handler identities change.
 */
export const useEditorBridge = (
  handlers: EditorBridgeHandlers,
): EditorBridge => {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) {
        return;
      }
      const data = event.data as unknown;
      if (!isHostToEditorMessage(data)) {
        return;
      }

      const current = handlersRef.current;
      switch (data.kind) {
        case "init":
          current.onInit(data);
          break;
        case "load":
          current.onLoad(data);
          break;
        case "setReadonly":
          current.onSetReadonly?.(data.readonly);
          break;
        case "revisionsList":
          current.onRevisionsList?.(data.revisions);
          break;
        case "saveResult":
          current.onSaveResult(data);
          break;
      }
    };

    window.addEventListener("message", onMessage);

    window.postMessage(
      { kind: "ready" } satisfies EditorToHostMessage,
      window.location.origin,
    );

    return () => window.removeEventListener("message", onMessage);
  }, []);

  const send = useCallback<EditorBridge["send"]>((message) => {
    window.postMessage(message, window.location.origin);
  }, []);

  return useMemo<EditorBridge>(() => ({ send }), [send]);
};
