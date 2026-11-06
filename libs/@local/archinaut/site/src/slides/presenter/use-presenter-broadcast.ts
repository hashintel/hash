/**
 * Keeps the presenter window in step with the deck: every change posts the
 * current note and the next one, a window that asks gets the latest, and
 * the returned function opens or focuses that window.
 */

import { useEffect, useRef } from "react";

import {
  createPresenterChannel,
  type PresenterChannel,
  type PresenterStateUpdate,
} from "./channel";

export type PresenterSnapshot = Omit<
  PresenterStateUpdate,
  "version" | "timestamp"
>;

export const usePresenterBroadcast = (
  snapshot: PresenterSnapshot,
): (() => void) => {
  const { deckId } = snapshot;
  const channelRef = useRef<PresenterChannel | null>(null);
  const windowRef = useRef<Window | null>(null);
  const latest = useRef(snapshot);

  useEffect(() => {
    const channel = createPresenterChannel({ role: "main", deckId });
    channelRef.current = channel;
    const unsubscribe = channel.subscribe((message) => {
      if (message.type === "STATE_REQUEST") {
        channel.postStateUpdate(latest.current);
      }
    });
    return () => {
      unsubscribe();
      channel.close();
      channelRef.current = null;
    };
  }, [deckId]);

  useEffect(() => {
    latest.current = snapshot;
    channelRef.current?.postStateUpdate(snapshot);
  }, [snapshot]);

  return () => {
    const channel = channelRef.current;
    const existing = windowRef.current;
    if (existing !== null && !existing.closed) {
      existing.focus();
      channel?.setPeerWindow(existing);
      channel?.postStateUpdate(latest.current);
      return;
    }
    const url = new URL(window.location.href);
    url.pathname = `${url.pathname.replace(/\/$/u, "")}/presenter`;
    url.hash = latest.current.slideId;
    const popup = window.open(
      url.toString(),
      `slides-presenter-${deckId}`,
      "popup,width=560,height=760",
    );
    if (popup === null) {
      return;
    }
    windowRef.current = popup;
    channel?.setPeerWindow(popup);
    popup.focus();
  };
};
