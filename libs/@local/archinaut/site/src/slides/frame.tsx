/**
 * The frame for a TSX slide: a kicker, a headline, the body, and a
 * takeaway revealed on the step the slide names. It is a `Slide`, so the
 * slide animates as one.
 */

import { Slide } from "./slide";
import { useStep } from "./stepper";

import type { ReactNode } from "react";

export const SlideFrame = ({
  kicker,
  title,
  takeaway,
  takeawayAt = 0,
  children,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  takeaway?: ReactNode;
  /** The step that reveals the takeaway. */
  takeawayAt?: number;
  children: ReactNode;
}) => {
  const step = useStep();
  const shown = step >= takeawayAt;
  return (
    <Slide className="deck-frame">
      {kicker === undefined ? null : (
        <p className="deck-frame__kicker">{kicker}</p>
      )}
      <h1 className="deck-frame__title">{title}</h1>
      <div className="deck-frame__body">{children}</div>
      {takeaway === undefined ? null : (
        <p
          className="deck-frame__takeaway"
          data-visible={shown}
          aria-hidden={!shown}
        >
          {takeaway}
        </p>
      )}
    </Slide>
  );
};
