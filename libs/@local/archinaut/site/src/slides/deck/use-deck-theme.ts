/**
 * Shows the page in a deck's theme while the deck is on screen, before the
 * first paint, and the reader's theme again when it leaves. A deck that
 * names no theme follows the reader's.
 */

import { useLayoutEffect } from "react";

import { forceTheme } from "../../shell/theme";

import type { DeckTheme } from "../decks";

export const useDeckTheme = (theme: DeckTheme | null): void => {
  useLayoutEffect(
    () => (theme === null ? undefined : forceTheme(theme)),
    [theme],
  );
};
