const CHANNEL_NAME = "slides.presenter";
const VERSION = 2;

export interface PresenterStateUpdate {
  version: number;
  deckId: string;
  deckTitle: string;
  slideId: string;
  slideIndex: number;
  totalSlides: number;
  step: number;
  totalSteps: number;
  note: string;
  nextNote: string;
  timestamp: number;
}

interface PresenterStateUpdateMessage {
  type: "STATE_UPDATE";
  payload: PresenterStateUpdate;
}

interface PresenterStateRequestMessage {
  type: "STATE_REQUEST";
  version: number;
}

export type PresenterMessage =
  | PresenterStateUpdateMessage
  | PresenterStateRequestMessage;

interface CreatePresenterChannelOptions {
  role: "main" | "presenter";
  deckId: string;
  peerWindow?: Window | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStateUpdatePayload(
  payload: unknown,
): payload is PresenterStateUpdate {
  if (!isRecord(payload)) return false;

  return (
    typeof payload.version === "number" &&
    typeof payload.deckId === "string" &&
    typeof payload.deckTitle === "string" &&
    typeof payload.slideId === "string" &&
    typeof payload.slideIndex === "number" &&
    typeof payload.totalSlides === "number" &&
    typeof payload.step === "number" &&
    typeof payload.totalSteps === "number" &&
    typeof payload.note === "string" &&
    typeof payload.nextNote === "string" &&
    typeof payload.timestamp === "number"
  );
}

function isPresenterMessage(value: unknown): value is PresenterMessage {
  if (!isRecord(value) || typeof value.type !== "string") return false;

  if (value.type === "STATE_REQUEST") {
    return typeof value.version === "number";
  }

  if (value.type === "STATE_UPDATE") {
    return isStateUpdatePayload(value.payload);
  }

  return false;
}

export interface PresenterChannel {
  postStateUpdate: (
    payload: Omit<PresenterStateUpdate, "version" | "timestamp">,
  ) => void;
  postStateRequest: () => void;
  setPeerWindow: (value: Window | null) => void;
  subscribe: (listener: (message: PresenterMessage) => void) => () => void;
  close: () => void;
}

export function createPresenterChannel({
  role,
  deckId,
  peerWindow: initialPeerWindow,
}: CreatePresenterChannelOptions): PresenterChannel {
  let peerWindow: Window | null =
    initialPeerWindow ?? (role === "presenter" ? window.opener : null);

  const listeners = new Set<(message: PresenterMessage) => void>();
  const supportsBroadcastChannel = typeof BroadcastChannel !== "undefined";
  const broadcastChannel = supportsBroadcastChannel
    ? new BroadcastChannel(`${CHANNEL_NAME}.${deckId}.v${VERSION}`)
    : null;
  const receive = (message: unknown) => {
    if (!isPresenterMessage(message)) return;
    for (const listener of listeners) {
      listener(message);
    }
  };

  let onMessage: ((event: MessageEvent<unknown>) => void) | null = null;

  if (broadcastChannel) {
    broadcastChannel.addEventListener("message", (event) => {
      receive(event.data);
    });
  } else {
    onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin) return;
      if (!isPresenterMessage(event.data)) return;

      if (role === "presenter") {
        if (window.opener && event.source !== window.opener) return;
      } else if (peerWindow && event.source !== peerWindow) {
        return;
      }

      receive(event.data);
    };

    window.addEventListener("message", onMessage);
  }

  const postMessage = (message: PresenterMessage) => {
    if (broadcastChannel) {
      broadcastChannel.postMessage(message);
      return;
    }

    if (role === "presenter") {
      const opener = window.opener;
      if (opener && !opener.closed) {
        opener.postMessage(message, window.location.origin);
      }
      return;
    }

    if (peerWindow && !peerWindow.closed) {
      peerWindow.postMessage(message, window.location.origin);
    }
  };

  return {
    postStateUpdate(payload) {
      postMessage({
        type: "STATE_UPDATE",
        payload: {
          ...payload,
          version: VERSION,
          timestamp: Date.now(),
        },
      });
    },
    postStateRequest() {
      postMessage({
        type: "STATE_REQUEST",
        version: VERSION,
      });
    },
    setPeerWindow(value: Window | null) {
      peerWindow = value;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close() {
      listeners.clear();
      if (onMessage) {
        window.removeEventListener("message", onMessage);
      }
      broadcastChannel?.close();
    },
  };
}
