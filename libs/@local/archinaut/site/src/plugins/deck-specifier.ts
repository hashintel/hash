/**
 * How the site imports a file of a deck: through `@decks` for the
 * instance's slides directory, which may lie anywhere, and through
 * `@archinaut/examples` for the examples the site ships.
 */

import { relative } from "node:path";

import { examplesRoot, type DeckFolder } from "../../../src/slides/folders.ts";

export const deckAliases = {
  instance: "@decks",
  example: "@archinaut/examples",
} as const;

export const deckFileSpecifier = (
  deck: Pick<DeckFolder, "origin">,
  slidesRoot: string | null,
  file: string,
): string =>
  `${deckAliases[deck.origin]}/${relative(deck.origin === "example" ? examplesRoot : (slidesRoot ?? ""), file)}`;
