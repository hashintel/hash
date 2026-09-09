import { useEffect } from "react";

const FIRING_ANIMATION_DURATION_MS = 300;

/** Marks this hook's own animations, so a new flash cancels only those. */
const FLASH_ANIMATION_ID = "petrinaut-transition-flash";

const FLASH_BACKGROUND = "rgba(255, 224, 132, 0.7)";
const FLASH_GLOW = "0 0 6px 1px rgba(255, 132, 0, 0.59)";

const cancelPreviousFlash = (element: HTMLDivElement): void => {
  for (const animation of element.getAnimations()) {
    if (animation.id === FLASH_ANIMATION_ID) {
      animation.cancel();
    }
  }
};

/**
 * Flashes a transition's box and its lightning bolt when the transition
 * fires, through the Web Animations API so the timing is driven from the
 * firing delta rather than from a class toggle.
 *
 * Each animation gives only its first frame and neither fills: the frame it
 * animates towards is the element's own styling, and the stylesheet owns the
 * property again the moment the flash ends. A flash that held its last frame
 * would freeze whatever the box looked like when it fired -- its fill, its
 * shadow, a hover shadow included -- for as long as the node stayed mounted.
 */
export const useFiringAnimation = (
  boxRef: React.RefObject<HTMLDivElement | null>,
  boltRef: React.RefObject<HTMLDivElement | null>,
  firingDelta: number | null,
): void => {
  useEffect(() => {
    // Only animate when there's an actual firing (delta > 0)
    if (firingDelta === null || firingDelta <= 0) {
      return;
    }

    const box = boxRef.current;
    const bolt = boltRef.current;

    if (!box || !bolt) {
      return;
    }

    cancelPreviousFlash(box);
    cancelPreviousFlash(bolt);

    // The box flashes yellow and glows, then fades back into its own fill.
    const boxFlash = box.animate(
      [{ offset: 0, background: FLASH_BACKGROUND, boxShadow: FLASH_GLOW }],
      {
        duration: FIRING_ANIMATION_DURATION_MS,
        easing: "ease-out",
        fill: "none",
      },
    );
    boxFlash.id = FLASH_ANIMATION_ID;

    // The bolt appears, then fades back into the hidden state it rests in.
    const boltFlash = bolt.animate(
      [{ offset: 0, opacity: 1, transform: "scale(1)" }],
      {
        duration: FIRING_ANIMATION_DURATION_MS * 3,
        easing: "cubic-bezier(0.4, 0, 0.2, 1)",
        fill: "none",
      },
    );
    boltFlash.id = FLASH_ANIMATION_ID;
  }, [firingDelta, boxRef, boltRef]);
};
