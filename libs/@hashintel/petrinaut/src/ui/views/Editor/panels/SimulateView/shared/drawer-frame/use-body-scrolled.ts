import { useState, type UIEvent } from "react";

/**
 * Whether a scroll container has moved off its top. Read from the element's
 * scroll events alone: the frame's header condenses on `scrollTop > 0` and
 * nothing else, so no observer is needed.
 */
export const useBodyScrolled = (): {
  scrolled: boolean;
  onScroll: (event: UIEvent<HTMLElement>) => void;
} => {
  const [scrolled, setScrolled] = useState(false);
  return {
    scrolled,
    onScroll: (event) => setScrolled(event.currentTarget.scrollTop > 0),
  };
};
