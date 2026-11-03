/**
 * Content a step brings in. Hidden content keeps its space, so the layout
 * never moves, and leaves the accessibility tree and tab order until shown.
 * `Reveal` draws a block; `RevealInline` draws a span, for a word in a
 * sentence, a table cell or part of a formula. In MDX the author writes
 * `Reveal` either way, and a reveal inside a line of text compiles to
 * `RevealInline`.
 *
 * `RevealGroup` does the same for a part of a drawing, an SVG group; a d2
 * block's stepped parts compile to it.
 *
 * `OnlyInline` is the other kind: it takes no space while hidden, so two of
 * them can share a place, one until a step and the next from it. A formula's
 * `\swap{n}{before}{after}` compiles to that pair.
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

/** A part of an inline SVG drawing, such as a shape a slide's d2 block marks `at-2`. */
export const RevealGroup = ({
  at = 0,
  until,
  children,
}: {
  /** The first step that shows the part; the slide's first by default. */
  at?: number;
  /** The first step that hides it again. */
  until?: number;
  children: ReactNode;
}) => {
  const shown = useShown(at, until);
  return (
    <g className="deck-reveal" data-visible={shown} aria-hidden={!shown}>
      {children}
    </g>
  );
};

export const OnlyInline = ({
  at = 0,
  until,
  children,
}: {
  /** The first step that shows the content; the slide's first by default. */
  at?: number;
  /** The first step that hides it again. */
  until?: number;
  children: ReactNode;
}) => {
  const shown = useShown(at, until);
  return (
    <span
      className="deck-only"
      data-visible={shown}
      aria-hidden={!shown}
      inert={!shown}
    >
      {children}
    </span>
  );
};
