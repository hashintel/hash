/**
 * The instance's decks and the examples, as the `archinaut-decks` plugin
 * listed them, and a deck loaded whole: every slide's module at once, so
 * stepping never waits on the network.
 */

import decksJson from "virtual:archinaut-decks";

import {
  resolveSlideModule,
  type LoadedSlide,
  type SlideSource,
} from "./slide-module";

/**
 * The mark in each slide's top-left corner, as `deck.json` names it, with
 * its height as a ratio of the corner's; `null` takes the default.
 */
export type DeckLogo =
  | { kind: "none" }
  | { kind: "site" | "hash"; scale: number | null }
  | { kind: "image"; src: string; scale: number | null };

/** The colours a deck keeps whatever the reader's theme; `null` follows the reader's. */
export type DeckTheme = "dark" | "light";

export interface DeckSummary {
  id: string;
  /** The instance's own deck, or an example archinaut ships. */
  origin: "instance" | "example";
  title: string;
  description: string;
  logo: DeckLogo;
  theme: DeckTheme | null;
  /** The deck folder's `deck.css`, when it has one. */
  loadStyle: (() => Promise<unknown>) | null;
  slides: SlideSource[];
}

export const decks: DeckSummary[] = decksJson;

export interface LoadedDeck {
  deck: DeckSummary;
  slides: LoadedSlide[];
}

const checkUniqueIds = (deck: DeckSummary, slides: LoadedSlide[]): void => {
  const seen = new Set<string>();
  for (const slide of slides) {
    if (seen.has(slide.id)) {
      throw new Error(
        `deck "${deck.id}" has two slides with the id "${slide.id}"`,
      );
    }
    seen.add(slide.id);
  }
};

export const loadDeck = async (id: string): Promise<LoadedDeck | null> => {
  const deck = decks.find((candidate) => candidate.id === id);
  if (deck === undefined) {
    return null;
  }
  // The deck's styles first, so a deck's or a slide's own CSS lands after
  // them and wins at the same specificity. Dynamic, so a docs page never
  // loads them.
  await import("./styles/base");
  const [slides] = await Promise.all([
    Promise.all(
      deck.slides.map(async (source) =>
        resolveSlideModule(source, await source.load()),
      ),
    ),
    deck.loadStyle?.(),
  ]);
  checkUniqueIds(deck, slides);
  return { deck, slides };
};
