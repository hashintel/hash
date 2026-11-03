/** The decks the instance has, to pick from. */

import { Link } from "@tanstack/react-router";
import { useEffect } from "react";

import "./styles/deck.css";

import type { DeckSummary } from "./decks";

export const DeckList = ({ decks }: { decks: readonly DeckSummary[] }) => {
  useEffect(() => {
    document.title = "Slides";
  }, []);
  return (
    <main className="deck-list">
      <h1>Slides</h1>
      {decks.length === 0 ? (
        <p>
          No deck yet. Run <code>archinaut slides new &lt;name&gt;</code> to
          start one.
        </p>
      ) : (
        <ul>
          {decks.map((deck) => (
            <li key={deck.id}>
              <Link to="/slides/$deck" params={{ deck: deck.id }}>
                {deck.title}
              </Link>
              <p>
                {deck.description === "" ? null : `${deck.description} · `}
                {deck.slides.length} slides
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
};
