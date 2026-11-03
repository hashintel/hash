/**
 * Content a step brings in. Hidden content keeps its space, so the layout
 * never moves, and leaves the accessibility tree and tab order until shown.
 */

import { useStep } from "./stepper";

import type { ReactNode } from "react";

export const Reveal = ({
  at,
  until,
  children,
}: {
  /** The first step that shows the content. */
  at: number;
  /** The first step that hides it again. */
  until?: number;
  children: ReactNode;
}) => {
  const step = useStep();
  const visible = step >= at && (until === undefined || step < until);
  return (
    <div
      className="deck-reveal"
      data-visible={visible}
      aria-hidden={!visible}
      inert={!visible}
    >
      {children}
    </div>
  );
};
