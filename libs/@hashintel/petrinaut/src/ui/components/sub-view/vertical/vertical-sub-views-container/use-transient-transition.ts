import { useRef, useState } from "react";

/**
 * Temporarily enables a boolean flag for `durationMs` after each call to
 * `trigger()`. Useful for enabling CSS transitions only during programmatic
 * state changes (e.g. collapse/expand) while keeping them disabled during
 * mount, resize, or drag interactions.
 */
export const useTransientTransition = (durationMs = 200) => {
  const [active, setActive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const trigger = () => {
    setActive(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setActive(false), durationMs);
  };

  return { active, trigger };
};
