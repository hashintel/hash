/**
 * The deck's state held in React: moves from the keyboard and the hash go
 * through the pure transitions in `deck-state.ts`. A slide change runs as a
 * view transition, and so does a step change on a slide whose parts morph. Slides report
 * their step counts and completed animations through the two callbacks.
 */

import { useEffect, useEffectEvent, useRef, useState } from "react";

import {
  completeStep,
  goToSlide,
  indexOfSlide,
  initialDeckState,
  nextState,
  previousState,
  registerSteps,
  transitionOf,
  type DeckState,
} from "../deck-state";
import { runViewTransition } from "../view-transition";
import { slideMorphs } from "./morph-names";

import type { LoadedSlide } from "../slide-module";
import type { SlideStepContextValue } from "../step-context";

export interface DeckControls {
  state: DeckState;
  slide: LoadedSlide;
  registerSteps: SlideStepContextValue["registerSteps"];
  completeStep: SlideStepContextValue["completeStep"];
}

const hashIndex = (slides: readonly LoadedSlide[]): number =>
  typeof window === "undefined"
    ? 0
    : (indexOfSlide(slides, window.location.hash.slice(1)) ?? 0);

const isEditable = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  target.closest(
    "input, textarea, select, button, a, [contenteditable='true']",
  ) !== null;

const toggleFullscreen = (): void => {
  if (document.fullscreenElement === null) {
    void document.documentElement.requestFullscreen();
  } else {
    void document.exitFullscreen();
  }
};

export const useDeck = (slides: readonly LoadedSlide[]): DeckControls => {
  const [state, setState] = useState(() =>
    initialDeckState(slides, hashIndex(slides)),
  );
  const slide = slides[state.index] ?? slides[0];
  if (slide === undefined) {
    throw new Error("a deck needs at least one slide");
  }

  /**
   * The target of a move whose view transition has not applied it yet. A
   * key pressed meanwhile moves on from there, so quick presses add up
   * instead of all computing the same next step from the stale state.
   */
  const inFlight = useRef<DeckState | null>(null);

  const move = (compute: (from: DeckState) => DeckState): void => {
    const from = inFlight.current ?? state;
    const next = compute(from);
    if (next === from) {
      return;
    }
    const transition = transitionOf(
      from,
      next,
      from.index === next.index && slideMorphs(document),
    );
    if (transition === null) {
      inFlight.current = null;
      setState(next);
      return;
    }
    inFlight.current = next;
    runViewTransition(transition, () => {
      // A newer move owns the state now; this one was overtaken.
      if (inFlight.current === next) {
        inFlight.current = null;
        setState(next);
      }
    });
  };

  const onKeyDown = useEffectEvent((event: KeyboardEvent): void => {
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      isEditable(event.target)
    ) {
      return;
    }
    const forward = () => move((from) => nextState(from, slides));
    const back = () => move((from) => previousState(from, slides));
    const actions: Record<string, () => void> = {
      ArrowRight: forward,
      ArrowDown: forward,
      " ": forward,
      PageDown: forward,
      ArrowLeft: back,
      ArrowUp: back,
      PageUp: back,
      Home: () => move((from) => goToSlide(from, slides, 0)),
      End: () => move((from) => goToSlide(from, slides, slides.length - 1)),
      f: toggleFullscreen,
    };
    const action = actions[event.key];
    if (action !== undefined) {
      event.preventDefault();
      action();
    }
  });
  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // The hash names the slide, so a link lands on it and a reload keeps it.
  useEffect(() => {
    if (window.location.hash.slice(1) !== slide.id) {
      window.history.replaceState(window.history.state, "", `#${slide.id}`);
    }
  }, [slide.id]);
  const onHashChange = useEffectEvent((): void => {
    const index = indexOfSlide(slides, window.location.hash.slice(1));
    if (index !== null && index !== state.index) {
      move((from) => goToSlide(from, slides, index));
    }
  });
  useEffect(() => {
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return {
    state,
    slide,
    registerSteps: (slideId, total) =>
      setState((current) => registerSteps(current, slides, slideId, total)),
    completeStep: (slideId, step) =>
      setState((current) => completeStep(current, slides, slideId, step)),
  };
};
