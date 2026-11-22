import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

const subscribe = (onChange: () => void): (() => void) => {
  if (typeof window.matchMedia !== "function") {
    return () => {};
  }
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

const getSnapshot = (): boolean =>
  typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;

/** Whether the viewer asked the system for reduced motion; follows the setting live. */
export const usePrefersReducedMotion = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, () => false);
