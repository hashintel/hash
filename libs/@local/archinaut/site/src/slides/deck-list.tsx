/** The decks the instance has, to pick from, then the examples archinaut ships. */

import { Link } from "@tanstack/react-router";
import { useEffect } from "react";

import "./styles/deck.css";

import type { DeckSummary } from "./decks";

const DeckLinks = ({ decks }: { decks: readonly DeckSummary[] }) => (
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
);

export const DeckList = ({ decks }: { decks: readonly DeckSummary[] }) => {
  useEffect(() => {
    document.title = "Slides";
  }, []);
  const own = decks.filter((deck) => deck.origin === "instance");
  const examples = decks.filter((deck) => deck.origin === "example");
  return (
    <main className="deck-list">
      <h1>Slides</h1>
      {own.length === 0 ? (
        <p>
          No deck yet. Run <code>archinaut slides new &lt;name&gt;</code> to
          start one.
        </p>
      ) : (
        <DeckLinks decks={own} />
      )}
      {examples.length === 0 ? null : (
        <section aria-labelledby="deck-list-examples">
          <h2 id="deck-list-examples">Examples</h2>
          <p>
            How slides are written, in MDX, TSX or both. Their source is in{" "}
            <code>libs/@local/archinaut/site/examples</code>.
          </p>
          <DeckLinks decks={examples} />
        </section>
      )}
    </main>
  );
};
