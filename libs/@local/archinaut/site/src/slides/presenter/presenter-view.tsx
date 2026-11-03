/**
 * The presenter window: the note for the current step, the cue for the
 * next one, and where the deck is. It only listens; the deck drives it.
 */

import { useEffect, useState } from "react";

import "./presenter.css";
import { createPresenterChannel, type PresenterStateUpdate } from "./channel";

export const PresenterView = ({
  deck,
}: {
  deck: { id: string; title: string };
}) => {
  const [state, setState] = useState<PresenterStateUpdate | null>(null);

  useEffect(() => {
    document.title = `${deck.title} · Presenter notes`;
    const channel = createPresenterChannel({
      role: "presenter",
      deckId: deck.id,
    });
    const unsubscribe = channel.subscribe((message) => {
      if (message.type === "STATE_UPDATE") {
        setState(message.payload);
      }
    });
    channel.postStateRequest();
    return () => {
      unsubscribe();
      channel.close();
    };
  }, [deck.id, deck.title]);

  if (state === null) {
    return (
      <main className="presenter">
        <p className="presenter__waiting">
          Waiting for the deck… open it in another window.
        </p>
      </main>
    );
  }

  const lastStep = state.step >= state.totalSteps - 1;
  const lastSlide = state.slideIndex >= state.totalSlides - 1;
  return (
    <main className="presenter">
      <div className="presenter__progress">
        <div
          className="presenter__progress-fill"
          style={{
            width: `${((state.slideIndex + 1) / state.totalSlides) * 100}%`,
          }}
        />
      </div>
      <header className="presenter__header">
        <span className="presenter__slide">
          {state.deckTitle} · #{state.slideId}
        </span>
        <span className="presenter__position">
          {state.slideIndex + 1}/{state.totalSlides}
          {state.totalSteps > 1
            ? ` · step ${state.step + 1}/${state.totalSteps}`
            : ""}
        </span>
      </header>
      <p className="presenter__note">
        {state.note === "" ? "No notes" : state.note}
      </p>
      <hr />
      <span className="presenter__next-label">
        {lastStep ? (lastSlide ? "End" : "Next slide") : "Next step"}
      </span>
      <p className="presenter__next">
        {state.nextNote === "" ? "—" : state.nextNote}
      </p>
    </main>
  );
};
