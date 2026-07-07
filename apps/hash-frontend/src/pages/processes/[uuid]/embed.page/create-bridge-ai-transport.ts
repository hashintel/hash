import { DefaultChatTransport } from "ai";

import {
  type HostToIframeMessage,
  type IframeToHostMessage,
  nextRequestId,
} from "../../shared/messages";

import type { PetrinautProps } from "@hashintel/petrinaut";

type PetrinautAiChatTransport = NonNullable<
  PetrinautProps["aiAssistant"]
>["transport"];

/**
 * The Petrinaut AI assistant runs inside this sandboxed null-origin iframe,
 * whose opaque origin can't send HASH's session cookie (and whose CSP blocks
 * outbound connections anyway). So instead of fetching the chat API directly,
 * its chat transport relays each request to the host page over the postMessage
 * bridge; the host fetches `/api/petrinaut-ai-chat` with the user's session and
 * streams the response back as raw bytes.
 *
 * We reconstruct those bytes into a `Response` and hand it to the AI SDK's
 * {@link DefaultChatTransport}, which owns the actual SSE parsing — keeping the
 * host a dumb, AI-SDK-agnostic byte relay.
 */

type PendingRequest = {
  stream: ReadableStream<Uint8Array>;
  controller: ReadableStreamDefaultController<Uint8Array>;
  resolveResponse: (response: Response) => void;
  rejectResponse: (error: Error) => void;
  responded: boolean;
};

const pendingRequests = new Map<string, PendingRequest>();

const postToHost = (message: IframeToHostMessage) => {
  // Target origin "*" — see `use-iframe-bridge.ts` for why a stricter value
  // isn't readable from a null-origin sandbox. Delivered to the parent only.
  window.parent.postMessage(message, "*");
};

let listenerInstalled = false;

const ensureListener = () => {
  if (listenerInstalled || typeof window === "undefined") {
    return;
  }
  listenerInstalled = true;

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) {
      return;
    }
    const data = event.data as unknown;
    if (
      typeof data !== "object" ||
      data === null ||
      typeof (data as { kind?: unknown }).kind !== "string"
    ) {
      return;
    }

    const message = data as HostToIframeMessage;
    if (
      message.kind !== "aiChatResponseStart" &&
      message.kind !== "aiChatChunk" &&
      message.kind !== "aiChatEnd" &&
      message.kind !== "aiChatError"
    ) {
      return;
    }

    const pending = pendingRequests.get(message.requestId);
    if (!pending) {
      return;
    }

    switch (message.kind) {
      case "aiChatResponseStart": {
        pending.responded = true;
        pending.resolveResponse(
          new Response(pending.stream, {
            status: message.status,
            statusText: message.statusText,
          }),
        );
        break;
      }
      case "aiChatChunk": {
        try {
          pending.controller.enqueue(message.bytes);
        } catch {
          // Stream already closed/errored (e.g. consumer aborted) — drop.
        }
        break;
      }
      case "aiChatEnd": {
        try {
          pending.controller.close();
        } catch {
          // Already closed.
        }
        pendingRequests.delete(message.requestId);
        break;
      }
      case "aiChatError": {
        const error = new Error(message.message);
        if (pending.responded) {
          try {
            pending.controller.error(error);
          } catch {
            // Already settled.
          }
        } else {
          pending.rejectResponse(error);
        }
        pendingRequests.delete(message.requestId);
        break;
      }
    }
  });
};

const bridgeFetch: typeof fetch = (_input, init) => {
  ensureListener();

  const requestId = nextRequestId();

  let streamController!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
    },
    cancel() {
      // The AI SDK cancelled the response stream (the user stopped the
      // assistant, the component unmounted, …). Ask the host to abort its
      // fetch so we don't keep streaming tokens nobody is reading.
      postToHost({ kind: "aiChatAbort", requestId });
      pendingRequests.delete(requestId);
    },
  });

  const responsePromise = new Promise<Response>((resolve, reject) => {
    pendingRequests.set(requestId, {
      stream,
      controller: streamController,
      resolveResponse: resolve,
      rejectResponse: reject,
      responded: false,
    });
  });

  // `DefaultChatTransport` always JSON-stringifies the request body.
  const body = typeof init?.body === "string" ? init.body : "";

  const signal = init?.signal ?? undefined;
  const onAbort = () => {
    postToHost({ kind: "aiChatAbort", requestId });
    const pending = pendingRequests.get(requestId);
    if (!pending) {
      return;
    }
    const abortError = new DOMException(
      "The operation was aborted.",
      "AbortError",
    );
    if (!pending.responded) {
      pending.rejectResponse(abortError);
    } else {
      try {
        pending.controller.error(abortError);
      } catch {
        // Already settled.
      }
    }
    pendingRequests.delete(requestId);
  };

  if (signal) {
    if (signal.aborted) {
      onAbort();
      return responsePromise;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }

  postToHost({ kind: "aiChatRequest", requestId, body });

  return responsePromise;
};

/**
 * Build the {@link PetrinautAiChatTransport} the embedded editor passes to
 * `<Petrinaut aiAssistant={{ transport }} />`. The `api` path is informational
 * only — the host hardcodes the real endpoint and ignores anything the
 * (untrusted) iframe would send as a URL.
 */
export const createBridgeAiChatTransport = (): PetrinautAiChatTransport =>
  new DefaultChatTransport({
    api: "/api/petrinaut-ai-chat",
    fetch: bridgeFetch,
  });
