/**
 * The colour theme: the reader's choice in `localStorage`, applied to the
 * document as `data-theme`, with `auto` following the system. The inline
 * script in `index.html` applies the stored choice before the first paint;
 * this module is the same logic for the running app.
 */

import { readStored, writeStored } from "../shared/storage";

export type Theme = "auto" | "dark" | "light";

const storageKey = "starlight-theme";

const parseTheme = (value: unknown): Theme =>
  value === "dark" || value === "light" ? value : "auto";

const listeners = new Set<() => void>();

export const readTheme = (): Theme => parseTheme(readStored(storageKey));

const systemTheme = (): "dark" | "light" =>
  matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";

export const applyTheme = (theme: Theme): void => {
  document.documentElement.dataset.theme =
    theme === "auto" ? systemTheme() : theme;
};

export const setTheme = (theme: Theme): void => {
  writeStored(storageKey, theme === "auto" ? "" : theme);
  applyTheme(theme);
  for (const listener of listeners) {
    listener();
  }
};

export const subscribeTheme = (listener: () => void): (() => void) => {
  listeners.add(listener);
  const media = matchMedia("(prefers-color-scheme: light)");
  const onSystemChange = (): void => {
    if (readTheme() === "auto") {
      applyTheme("auto");
    }
  };
  media.addEventListener("change", onSystemChange);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onSystemChange);
  };
};
