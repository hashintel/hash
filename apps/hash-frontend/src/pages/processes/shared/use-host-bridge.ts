import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
  onAiChatRequest?: (
    payload: Extract<IframeToHostMessage, { kind: "aiChatRequest" }>,
  ) => void;
  onAiChatAbort?: (
    payload: Extract<IframeToHostMessage, { kind: "aiChatAbort" }>,
  ) => void;
  onOptimizationRequest?: (
    payload: Extract<IframeToHostMessage, { kind: "optimizationRequest" }>,
  ) => void;
  onOptimizationAbort?: (
    payload: Extract<IframeToHostMessage, { kind: "optimizationAbort" }>,
  ) => void;
  onAiMessagesChanged?: (
    payload: Extract<IframeToHostMessage, { kind: "aiMessagesChanged" }>,
  ) => void;
  onAiMessagesCleared?: () => void;
};

type HostBridge = {
  /**
   * Whether the iframe has signalled `ready`. The host should not call `send`
   * until this is `true` (sending earlier would race the iframe's mount and
   * the message would be dropped).
   */
  isReady: boolean;
  /** Send a message into the iframe. No-op if the iframe isn't mounted. */
  send: (message: HostToIframeMessage) => void;
};

/**
 * Host-side hook that owns the postMessage channel to a Petrinaut iframe.
 *
 * - Listens for messages on `window` and dispatches them to the matching
 *   handler. Messages from any source other than `iframeRef.current.contentWindow`
 *   are dropped, so a sibling iframe or an unrelated window can't drive the
 *   bridge.
 * - Tracks whether the iframe has signalled `ready`. Until then, `send()` is
 *   a no-op (and the host typically waits to push `init`).
 *
 * The hook intentionally treats `handlers` as a "snapshot" — it stores the
 * latest handlers in a ref and re-reads them inside the message listener, so
 * the listener doesn't need to be re-attached when handler identities change.
 */
export const useHostBridge = ({
  iframeRef,
  handlers,
}: {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  handlers: HostBridgeHandlers;
}): HostBridge => {
  const [isReady, setIsReady] = useState(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow || event.source !== iframeWindow) {
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
        case "aiChatRequest":
          current.onAiChatRequest?.(data);
          break;
        case "aiChatAbort":
          current.onAiChatAbort?.(data);
          break;
        case "optimizationRequest":
          current.onOptimizationRequest?.(data);
          break;
        case "optimizationAbort":
          current.onOptimizationAbort?.(data);
          break;
        case "aiMessagesChanged":
          current.onAiMessagesChanged?.(data);
          break;
        case "aiMessagesCleared":
          current.onAiMessagesCleared?.();
          break;
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [iframeRef]);

  /**
   * Reset readiness on every (re)load of the iframe document, so `isReady`
   * drops back to `false` until the freshly-loaded document re-posts `ready`.
   * Fires on the initial load and on any full reload of the *same* element.
   *
   * This attaches to whichever element `iframeRef` points at when the hook
   * mounts. The sole consumer (`process-editor`) mounts the iframe once with a
   * stable `src` and drives net changes over the bridge rather than remounting
   * it, so a static listener is sufficient. If a consumer ever swapped the
   * `<iframe>` element (e.g. via `key`), this would need to become a callback
   * ref to re-attach to the new element.
   */
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }
    const onLoad = () => setIsReady(false);
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [iframeRef]);

  const send = useCallback<HostBridge["send"]>(
    (message) => {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow) {
        return;
      }
      /**
       * Target origin is "*" because a sandboxed iframe without
       * `allow-same-origin` has an opaque origin we can't address by string.
       * The data is delivered to this specific iframe's window, not
       * broadcast, so a third party can't intercept it.
       */
      iframeWindow.postMessage(message, "*");
    },
    [iframeRef],
  );

  return useMemo<HostBridge>(() => ({ isReady, send }), [isReady, send]);
};
