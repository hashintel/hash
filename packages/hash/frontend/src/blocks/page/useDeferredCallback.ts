import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Debounce a callback by 500ms, cancelling the last time it was called
 */
export const useDeferredCallback = () => {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCallback = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
  }, []);

  useLayoutEffect(() => {
    return () => {
      clearCallback();
    };
  }, [clearCallback]);

  const deferCallback = useCallback(
    (callback: () => unknown) => {
      clearCallback();

      saveTimer.current = setTimeout(callback, 500);
    },
    [clearCallback]
  );

  return [deferCallback, clearCallback] as const;
};
