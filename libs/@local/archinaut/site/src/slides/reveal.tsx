/**
 * Content a step brings in. Hidden content keeps its space, so the layout
 * never moves, and leaves the accessibility tree and tab order until shown.
 * `Reveal` draws a block; `RevealInline` draws a span, for a word in a
 * sentence, a table cell or part of a formula. In MDX the author writes
 * `Reveal` either way, and a reveal inside a line of text compiles to
 * `RevealInline`.
 */

import { useStep } from "./stepper";

import type { ReactNode } from "react";

interface RevealProps {
  /** The first step that shows the content. */
  at: number;
  /** The first step that hides it again. */
  until?: number;
  children: ReactNode;
}

const useShown = (at: number, until: number | undefined): boolean => {
  const step = useStep();
  return step >= at && (until === undefined || step < until);
};

export const Reveal = ({ at, until, children }: RevealProps) => {
  const shown = useShown(at, until);
  return (
    <div
      className="deck-reveal"
      data-visible={shown}
      aria-hidden={!shown}
      inert={!shown}
    >
      {children}
    </div>
  );
};

export const RevealInline = ({ at, until, children }: RevealProps) => {
  const shown = useShown(at, until);
  return (
    <span
      className="deck-reveal"
      data-visible={shown}
      aria-hidden={!shown}
      inert={!shown}
    >
      {children}
    </span>
  );
};
