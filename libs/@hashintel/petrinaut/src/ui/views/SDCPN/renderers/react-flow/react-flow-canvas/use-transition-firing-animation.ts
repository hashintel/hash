import { useStoreApi } from "@xyflow/react";
import { useEffect } from "react";

import { useLatest } from "../../../../../../react/hooks/use-latest";
import { nodeFiringIsVisible } from "./firing-animation-visibility";

const FIRING_ANIMATION_DURATION_MS = 300;

/**
 * Flashes a transition's box and its lightning bolt when it fires, through
 * the Web Animations API. Skipped for a transition that is off screen or
 * drawn too small to see.
 */
export const useTransitionFiringAnimation = (
  boxRef: React.RefObject<HTMLDivElement | null>,
  boltRef: React.RefObject<HTMLDivElement | null>,
  firingDelta: number | null,
  position: { x: number; y: number },
): void => {
  // The viewport is read when a firing lands rather than subscribed to, so a
  // pan or a zoom does not re-render every transition on the canvas.
  const store = useStoreApi();
  // Held in a ref so a node drag during a firing does not restart it.
  const positionRef = useLatest(position);

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

    const { x, y } = positionRef.current;
    if (!nodeFiringIsVisible(store.getState(), x, y)) {
      return;
    }

    // Flash the box yellow with a glow. Only the flash is a keyframe: the
    // animation runs back to whatever the stylesheet says, so the focus ring's
    // white band in `box-shadow` returns once it is over instead of staying
    // replaced by the glow's transparent end.
    box.animate(
      [
        {
          background: "rgba(255, 224, 132, 0.7)",
          boxShadow: "0 0 6px 1px rgba(255, 132, 0, 0.59)",
          offset: 0,
        },
      ],
      {
        duration: FIRING_ANIMATION_DURATION_MS,
        easing: "ease-out",
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
  }, [firingDelta, boxRef, boltRef, positionRef, store]);
};
