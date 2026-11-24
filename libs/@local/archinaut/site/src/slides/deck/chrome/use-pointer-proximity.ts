/** Whether the pointer is near an element, settled for a while, or inside the region that keeps it. */

import { useEffect, useState, type RefObject } from "react";

import {
  observePointerProximity,
  type ProximityOptions,
} from "./pointer-proximity";

export const usePointerProximity = (
  ref: RefObject<HTMLElement | null>,
  { radius = 80, settleMs = 0, leaveMs = 0 }: ProximityOptions = {},
  retainWithin?: RefObject<HTMLElement | null>,
): boolean => {
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (ref.current === null) {
      return;
    }
    return observePointerProximity(
      ref.current,
      setNear,
      { radius, settleMs, leaveMs },
      retainWithin?.current ?? undefined,
    );
  }, [leaveMs, radius, ref, retainWithin, settleMs]);
  return near;
};
