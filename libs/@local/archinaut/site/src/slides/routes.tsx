/**
 * The deck routes' components, loaded on first visit so a docs page ships
 * none of the deck runtime. Each reads what its route's loader resolved.
 */

import { getRouteApi } from "@tanstack/react-router";

import { DeckList } from "./deck-list";
import { DeckPrint } from "./deck-print";
import { Deck } from "./deck/deck";
import { decks } from "./decks";
import { PresenterView } from "./presenter/presenter-view";

const deckRoute = getRouteApi("/slides/$deck");
const printRoute = getRouteApi("/slides/$deck/print");
const presenterRoute = getRouteApi("/slides/$deck/presenter");

export const DeckListRoute = () => <DeckList decks={decks} />;

export const DeckRoute = () => {
  const { deck, slides } = deckRoute.useLoaderData();
  return <Deck key={deck.id} deck={deck} slides={slides} />;
};

export const DeckPrintRoute = () => {
  const { deck, slides } = printRoute.useLoaderData();
  return <DeckPrint deck={deck} slides={slides} />;
};

export const PresenterRoute = () => {
  const { deck } = presenterRoute.useLoaderData();
  return <PresenterView deck={deck} />;
};
