/**
 * A part that keeps its identity across steps. Shown in one place on one
 * step and in another on the next, it glides between them on a slide: the
 * deck runs that step change as a view transition, and every part with the
 * same name is one element to it. A docs page's `Steps` block swaps it
 * without the glide, since a view transition takes the whole page and two
 * blocks may play at once. Only one part may carry a name at a time, so the
 * places a part moves between are the sides of a swap, or reveals that
 * hand over on the same step.
 *
 * In a formula, `\morph{name}{…}` compiles to this.
 */

import "./steps.css";
import type { CSSProperties, ReactNode } from "react";

/** A CSS identifier for the view transition, from the name the author gave. */
export const morphTransitionName = (name: string): string =>
  `morph-${name.replace(/[^\w-]/gu, "-")}`;

export const Morph = ({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) => (
  <span
    className="deck-morph"
    data-morph={name}
    style={{ viewTransitionName: morphTransitionName(name) } as CSSProperties}
  >
    {children}
  </span>
);
