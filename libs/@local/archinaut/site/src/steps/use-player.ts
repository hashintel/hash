/**
 * Plays a docs page's `Steps` block. Once the block is out of view it
 * rewinds to its first step, so the reader never sees it empty itself;
 * when half of it, or half the window, is in view, it plays. Each step
 * holds until its animations have ended and a beat more, then the next
 * comes. Without motion the block stays on its last step.
 */

import { useEffect, useState, type RefObject } from "react";

import {
  advancePlayer,
  armPlayer,
  completePlayerStep,
  registerPlayerSteps,
  replayPlayer,
  startPlayer,
  stillPlayer,
  type PlayerState,
} from "./player";

/** How long a step stays after its animations end. */
const holdMs = 1200;

/** Whether enough of the block is in view to play it. */
const enoughInView = (entry: IntersectionObserverEntry): boolean =>
  entry.intersectionRatio >= 0.5 ||
  entry.intersectionRect.height >= (entry.rootBounds?.height ?? 0) * 0.5;

/** The animations still to finish under `element`; a flow repeats forever, so it never counts. */
const finishing = (element: HTMLElement | null): Promise<unknown> =>
  Promise.allSettled(
    (element?.getAnimations({ subtree: true }) ?? [])
      .filter(
        (animation) =>
          animation.effect?.getComputedTiming().endTime !==
          Number.POSITIVE_INFINITY,
      )
      .map((animation) => animation.finished),
  );

export const usePlayer = (
  count: number,
  block: RefObject<HTMLDivElement | null>,
): {
  state: PlayerState;
  replay: () => void;
  register: (scope: string, total: number) => void;
  complete: (scope: string, step: number) => void;
} => {
  const [state, setState] = useState(() => stillPlayer(count));

  useEffect(() => {
    const element = block.current;
    if (
      element === null ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry === undefined) {
          return;
        }
        setState((current) =>
          entry.isIntersecting && enoughInView(entry)
            ? startPlayer(armPlayer(current))
            : armPlayer(current),
        );
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [block]);

  useEffect(() => {
    if (state.phase !== "playing") {
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void finishing(block.current).then(() => {
      if (!cancelled) {
        timer = setTimeout(() => setState(advancePlayer), holdMs);
      }
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [block, state.phase, state.step]);

  return {
    state,
    replay: () => setState(replayPlayer),
    register: (_scope, total) =>
      setState((current) => registerPlayerSteps(current, total)),
    complete: (_scope, step) =>
      setState((current) => completePlayerStep(current, step)),
  };
};
