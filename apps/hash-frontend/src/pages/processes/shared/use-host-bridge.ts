import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type HostToIframeMessage,
  type IframeToHostMessage,
  isIframeToHostMessage,
} from "./messages";

type HostBridgeHandlers = {
  onReady?: () => void;
  onDirtyChanged?: (isDirty: boolean) => void;
  onTitleChanged?: (title: string) => void;
  onRequestSave?: (
    payload: Extract<IframeToHostMessage, { kind: "requestSave" }>,
  ) => void;
  onRequestNavigateBack?: () => void;
  onRequestRevision?: (decisionTime: string) => void;
  onReportError?: (
    payload: Extract<IframeToHostMessage, { kind: "reportError" }>,
  ) => void;
  onOptimizationCreate?: (
    payload: Extract<IframeToHostMessage, { kind: "optimizationCreate" }>,
  ) => void;
  onOptimizationAttach?: (
    payload: Extract<IframeToHostMessage, { kind: "optimizationAttach" }>,
  ) => void;
  onOptimizationAbort?: (
    payload: Extract<IframeToHostMessage, { kind: "optimizationAbort" }>,
  ) => void;
  onOptimizationCancel?: (
    payload: Extract<IframeToHostMessage, { kind: "optimizationCancel" }>,
  ) => void;
};

type HostBridge = {
  /**
   * Whether the editor has signalled `ready`. The host should not call `send`
   * until this is `true` (sending earlier would race the editor's mount and
   * the message would be dropped).
   */
  isReady: boolean;
  /** Send a message to the editor. */
  send: (message: HostToIframeMessage) => void;
};

/**
 * Host-side hook that owns the postMessage channel to the Petrinaut editor,
 * which renders in this page and posts to this window.
 *
 * - Listens for messages on `window` and dispatches them to the matching
 *   handler. Messages from any source other than this window are dropped, so
 *   an iframe or an unrelated window can't drive the bridge. Host and editor
 *   message kinds are disjoint, so the host ignores its own messages.
 * - Tracks whether the editor has signalled `ready` (the host waits for it
 *   to push `init`).
 *
 * The hook intentionally treats `handlers` as a "snapshot" — it stores the
 * latest handlers in a ref and re-reads them inside the message listener, so
 * the listener doesn't need to be re-attached when handler identities change.
 */
export const useHostBridge = ({
  handlers,
}: {
  handlers: HostBridgeHandlers;
}): HostBridge => {
  const [isReady, setIsReady] = useState(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) {
        return;
      }

      const data = event.data as unknown;
      if (!isIframeToHostMessage(data)) {
        return;
      }

      const current = handlersRef.current;
      switch (data.kind) {
        case "ready":
          setIsReady(true);
          current.onReady?.();
          break;
        case "dirtyChanged":
          current.onDirtyChanged?.(data.isDirty);
          break;
        case "titleChanged":
          current.onTitleChanged?.(data.title);
          break;
        case "requestSave":
          current.onRequestSave?.(data);
          break;
        case "requestNavigateBack":
          current.onRequestNavigateBack?.();
          break;
        case "requestRevision":
          current.onRequestRevision?.(data.decisionTime);
          break;
        case "reportError":
          current.onReportError?.(data);
          break;
        case "optimizationCreate":
          current.onOptimizationCreate?.(data);
          break;
        case "optimizationAttach":
          current.onOptimizationAttach?.(data);
          break;
        case "optimizationAbort":
          current.onOptimizationAbort?.(data);
          break;
        case "optimizationCancel":
          current.onOptimizationCancel?.(data);
          break;
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const send = useCallback<HostBridge["send"]>((message) => {
    window.postMessage(message, window.location.origin);
  }, []);

  return useMemo<HostBridge>(() => ({ isReady, send }), [isReady, send]);
};
