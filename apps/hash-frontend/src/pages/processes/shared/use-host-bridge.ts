import {
  type RefObject,
  useCallback,
  useEffect,
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
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [iframeRef]);

  /**
   * Reset readiness whenever the iframe element is swapped out (e.g. host
   * navigates between draft and saved view by re-mounting the iframe). The
   * `iframeRef.current` identity isn't reactive on its own, so consumers
   * remount the `<iframe>` via `key` and we observe the load event.
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

  return { isReady, send };
};
