import { afterEach, vi } from "vitest";

/**
 * Run queued microtasks at once and collect what they throw, so a test can see
 * that a throwing observer was isolated from the transport and re-raised.
 */
export const useRaisedErrors = (): (() => unknown[]) => {
  let restore: (() => void) | undefined;
  afterEach(() => {
    restore?.();
    restore = undefined;
  });
  return () => {
    const raised: unknown[] = [];
    const spy = vi
      .spyOn(globalThis, "queueMicrotask")
      .mockImplementation((callback) => {
        try {
          callback();
        } catch (error) {
          raised.push(error);
        }
      });
    restore = () => spy.mockRestore();
    return raised;
  };
};
