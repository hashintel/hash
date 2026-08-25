import { useEffect, useLayoutEffect } from "react";

/**
 * `useLayoutEffect` that falls back to `useEffect` during SSR, where
 * `useLayoutEffect` cannot run and React warns.
 */
export const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;
