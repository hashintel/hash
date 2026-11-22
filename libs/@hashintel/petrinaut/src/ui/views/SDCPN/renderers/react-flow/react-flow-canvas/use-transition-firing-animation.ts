import { useStoreApi } from "@xyflow/react";
import { use, useEffect } from "react";

import { useLatest } from "../../../../../../react/hooks/use-latest";
import {
  fadedColor,
  fadedNodeStrength,
  insideFadedNode,
} from "../../../styles/node-fade";
import { ArcPulsesContext } from "./arc-pulses";
import { firingIsVisible } from "./firing-animation-visibility";

const FIRING_ANIMATION_DURATION_MS = 300;

/**
 * Shows that a transition fired: its arcs pulse, and its box and its
 * lightning bolt flash through the Web Animations API. The flash is skipped
 * for a transition that is off screen or drawn too small to see, and each
 * arc decides the same for itself.
 */
export const useTransitionFiringAnimation = (
  transitionId: string,
  boxRef: React.RefObject<HTMLDivElement | null>,
  boltRef: React.RefObject<HTMLDivElement | null>,
  firingDelta: number | null,
  position: { x: number; y: number },
): void => {
  // The viewport is read when a firing lands rather than subscribed to, so a
  // pan or a zoom does not re-render every transition on the canvas.
  const store = useStoreApi();
  const arcPulses = use(ArcPulsesContext);
  // Held in a ref so a node drag during a firing does not restart it.
  const positionRef = useLatest(position);

  useEffect(() => {
    // Only animate when there's an actual firing (delta > 0)
    if (firingDelta === null || firingDelta <= 0) {
      return;
    }

    arcPulses.fire(transitionId, firingDelta);

    const box = boxRef.current;
    const bolt = boltRef.current;

    if (!box || !bolt) {
      return;
    }

    if (!firingIsVisible(store.getState(), positionRef.current)) {
      return;
    }

    // Flash the box yellow with a glow. Only the flash is a keyframe: the
    // animation runs back to whatever the stylesheet says, so the focus ring's
    // white band in `box-shadow` returns once it is over instead of staying
    // replaced by the glow's transparent end. A transition outside the focused
    // neighbourhood flashes as faded as it is drawn.
    const faded = box.matches(insideFadedNode);
    const ring = faded ? "--node-faded-outline-ring" : "--node-outline-ring";
    const flash = "rgba(255, 224, 132, 0.7)";
    const glow = "rgba(255, 132, 0, 0.59)";
    box.animate(
      [
        {
          background: faded ? fadedColor(flash) : flash,
          boxShadow: `var(${ring}, 0 0 #0000), 0 0 6px 1px ${faded ? fadedColor(glow) : glow}`,
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
        { opacity: faded ? fadedNodeStrength : 1, transform: "scale(1)" },
        { opacity: 0, transform: "scale(0.5)" },
      ],
      {
        duration: FIRING_ANIMATION_DURATION_MS * 3,
        easing: "cubic-bezier(0.4, 0, 0.2, 1)",
        fill: "forwards",
      },
    );
  }, [
    firingDelta,
    transitionId,
    arcPulses,
    boxRef,
    boltRef,
    positionRef,
    store,
  ]);
};
