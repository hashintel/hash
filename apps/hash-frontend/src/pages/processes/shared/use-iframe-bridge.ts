import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  type HostToIframeMessage,
  type IframeToHostMessage,
  isHostToIframeMessage,
} from "./messages";

type IframeBridgeHandlers = {
  onInit: (payload: Extract<HostToIframeMessage, { kind: "init" }>) => void;
  onLoad: (payload: Extract<HostToIframeMessage, { kind: "load" }>) => void;
  onSetReadonly?: (readonly: boolean) => void;
  onSetCapabilities?: (
    capabilities: Extract<
      HostToIframeMessage,
      { kind: "setCapabilities" }
    >["capabilities"],
  ) => void;
  onRevisionsList?: (
    revisions: Extract<
      HostToIframeMessage,
      { kind: "revisionsList" }
    >["revisions"],
  ) => void;
  onSaveResult: (
    payload: Extract<HostToIframeMessage, { kind: "saveResult" }>,
  ) => void;
};

type IframeBridge = {
  /** Send a message up to the host. */
  send: (message: IframeToHostMessage) => void;
};

/**
 * Iframe-side companion to {@link useHostBridge}.
 *
 * - Posts a `ready` message exactly once on mount so the host can push `init`.
 * - Listens for messages on `window` and dispatches them to the matching
 *   handler. Messages from any source other than `window.parent` are
 *   dropped, so an unrelated cross-frame postMessage can't drive the bridge.
 *
 * Like the host hook, handlers are stored in a ref so the listener doesn't
 * need to re-attach when handler identities change.
 */
export const useIframeBridge = (
  handlers: IframeBridgeHandlers,
): IframeBridge => {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) {
        return;
      }
      const data = event.data as unknown;
      if (!isHostToIframeMessage(data)) {
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
        case "setCapabilities":
          current.onSetCapabilities?.(data.capabilities);
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

    /**
     * Target origin is "*" because the host's origin is not reliably
     * readable from a null-origin sandboxed iframe (`window.parent.origin`
     * is cross-origin, `document.location.origin` returns "null"). The
     * message is delivered to the parent window only; an unrelated tab
     * cannot intercept it.
     */
    window.parent.postMessage(
      { kind: "ready" } satisfies IframeToHostMessage,
      "*",
    );

    return () => window.removeEventListener("message", onMessage);
  }, []);

  const send = useCallback<IframeBridge["send"]>((message) => {
    window.parent.postMessage(message, "*");
  }, []);

  return useMemo<IframeBridge>(() => ({ send }), [send]);
};
