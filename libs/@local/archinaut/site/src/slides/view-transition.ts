/**
 * Runs a slide change inside `document.startViewTransition`, marking the
 * document with its direction so the transition styles pick the animation. A newer move skips the running one; reduced
 * motion and browsers without the API apply the move directly.
 */

import { flushSync } from "react-dom";

import type { Direction } from "./deck-state";

let active: ViewTransition | null = null;

export const runViewTransition = (
  direction: Direction,
  apply: () => void,
): void => {
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (typeof document.startViewTransition !== "function" || reduceMotion) {
    apply();
    return;
  }
  active?.skipTransition();
  const root = document.documentElement;
  root.dataset.transitionDirection = direction;
  const transition = document.startViewTransition(() => {
    flushSync(apply);
  });
  active = transition;
  const clear = (): void => {
    if (active !== transition) {
      return;
    }
    active = null;
    delete root.dataset.transitionDirection;
  };
  // A newer move skips this transition, which rejects `ready` with an
  // AbortError; that is the expected way for it to end. `finished` settles
  // either way, and the marks go with it.
  transition.ready.catch(() => {});
  void transition.finished.then(clear, clear);
};
