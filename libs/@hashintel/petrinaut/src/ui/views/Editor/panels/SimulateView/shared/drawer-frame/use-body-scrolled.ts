import { useState, type UIEvent } from "react";

/**
 * Whether a scroll container has moved off its top, read from its scroll
 * events alone. The frame's header condenses on it, which hands the body
 * `condensedGain` pixels of height; content overflowing by less than that
 * would fit once the header condensed, clamp the offset back to zero and
 * expand it again on every wheel tick. So the container only counts as
 * scrolled once it overflows by more than the gain, measured while it is at
 * its expanded height, and stays scrolled on any overflow at all until the
 * offset is back at zero.
 */
export const useBodyScrolled = (
  condensedGain: number,
): {
  scrolled: boolean;
  onScroll: (event: UIEvent<HTMLElement>) => void;
} => {
  const [scrolled, setScrolled] = useState(false);
  return {
    scrolled,
    onScroll: (event) => {
      const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
      setScrolled(
        (was) =>
          scrollTop > 0 &&
          scrollHeight - clientHeight > (was ? 0 : condensedGain),
      );
    },
  };
};
