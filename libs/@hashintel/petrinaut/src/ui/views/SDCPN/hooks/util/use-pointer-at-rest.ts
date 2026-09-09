import { useEffect, useState } from "react";

/**
 * Movement smaller than this is a hand resting on the mouse, not a gesture,
 * and leaves the pointer at rest. Measured from the last position that
 * counted, so a slow drift still adds up to a move.
 */
const MOVEMENT_THRESHOLD_PX = 2;

/** How long the pointer has to hold still before it counts as at rest. */
const REST_DELAY_MS = 50;

/**
 * Whether the pointer has stopped moving over `ref`'s element.
 *
 * Anything that follows the pointer can hold still while a gesture is in
 * flight and act once it lands, rather than firing for every position the
 * pointer passes through. Movement elsewhere on the page is not this
 * element's business, and a pointer that leaves it comes to rest like any
 * other pointer that has stopped arriving.
 */
export const usePointerAtRest = (
  ref: React.RefObject<HTMLElement | null>,
): boolean => {
  const [atRest, setAtRest] = useState(true);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    let lastCounted: { x: number; y: number } | null = null;
    let moving = false;
    let restTimer: ReturnType<typeof setTimeout> | undefined;

    const settle = () => {
      moving = false;
      setAtRest(true);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (
        lastCounted !== null &&
        Math.hypot(
          event.clientX - lastCounted.x,
          event.clientY - lastCounted.y,
        ) <= MOVEMENT_THRESHOLD_PX
      ) {
        return;
      }

      lastCounted = { x: event.clientX, y: event.clientY };

      // Only the transitions reach React: a move fires far too often to
      // re-render on, and the state it drives has just two values.
      if (!moving) {
        moving = true;
        setAtRest(false);
      }

      clearTimeout(restTimer);
      restTimer = setTimeout(settle, REST_DELAY_MS);
    };

    element.addEventListener("pointermove", onPointerMove, { passive: true });

    return () => {
      element.removeEventListener("pointermove", onPointerMove);
      clearTimeout(restTimer);
    };
  }, [ref]);

  return atRest;
};
