/**
 * The element a slide draws into. It carries the `slide` view-transition
 * name, so a slide change animates the slide while the deck's chrome stays.
 */

import type { CSSProperties, ReactNode } from "react";

export const Slide = ({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) => (
  <div
    className={`slide ${className}`}
    style={{ viewTransitionName: "slide", ...style }}
  >
    {children}
  </div>
);
