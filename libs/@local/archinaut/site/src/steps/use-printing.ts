/**
 * Whether the page is being printed: true from the browser's `beforeprint`
 * to its `afterprint`. Each switch renders before its event returns, so the
 * page is laid out for paper with every block on its last step.
 */

import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

let printing = false;

const subscribe = (onChange: () => void): (() => void) => {
  const before = (): void => {
    printing = true;
    flushSync(onChange);
  };
  const after = (): void => {
    printing = false;
    flushSync(onChange);
  };
  window.addEventListener("beforeprint", before);
  window.addEventListener("afterprint", after);
  return () => {
    window.removeEventListener("beforeprint", before);
    window.removeEventListener("afterprint", after);
  };
};

export const usePrinting = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => printing,
    () => false,
  );
