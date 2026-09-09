import { useEffect } from "react";

const FIRING_ANIMATION_DURATION_MS = 300;

/**
 * Flashes a transition's box and its lightning bolt when the transition
 * fires, through the Web Animations API so the timing is driven from the
 * firing delta rather than from a class toggle.
 *
 * The box flash ends on the box's own resting background, read off the
 * element once any flash still in flight is cancelled: the animation holds
 * its last frame, so a fixed colour here would leave every fired transition
 * tinted for as long as it stays mounted.
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

    for (const animation of box.getAnimations()) {
      animation.cancel();
    }

    const restingBackground = getComputedStyle(box).backgroundColor;

    // Animate the box: flash yellow background and glow
    box.animate(
      [
        {
          background: "rgba(255, 224, 132, 0.7)",
          boxShadow: "0 0 6px 1px rgba(255, 132, 0, 0.59)",
        },
        {
          background: restingBackground,
          boxShadow: "0 0 0 0 rgba(255, 132, 0, 0)",
        },
      ],
      {
        duration: FIRING_ANIMATION_DURATION_MS,
        easing: "ease-out",
        fill: "forwards",
      },
    );

    // Animate the lightning bolt: appear then fade out
    bolt.animate(
      [
        { opacity: 1, transform: "scale(1)" },
        { opacity: 0, transform: "scale(0.5)" },
      ],
      {
        duration: FIRING_ANIMATION_DURATION_MS * 3,
        easing: "cubic-bezier(0.4, 0, 0.2, 1)",
        fill: "forwards",
      },
    );
  }, [firingDelta, boxRef, boltRef]);
};
