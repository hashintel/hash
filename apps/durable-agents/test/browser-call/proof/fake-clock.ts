import type { SetTimer } from "@earendil-works/pi-durable";

/** `setTimeout` takes at most this delay; a longer timer re-arms when it fires early. */
const maxDelayMs = 2 ** 31 - 1;

/**
 * A Harness clock (`HarnessOptions.now` and `setTimer`) that runs at real
 * speed from `offsetMs` ahead of the wall clock, so a process can open the
 * storage as if a long absence had passed since the last one. Timers are
 * due on this clock.
 */
export const fakeClock = (offsetMs: number) => {
  const now = () => Date.now() + offsetMs;
  const setTimer: SetTimer = (callback, delayMs, { background }) => {
    const due = now() + delayMs;
    let handle: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      handle = setTimeout(
        () => (due > now() ? arm() : callback()),
        Math.min(Math.max(due - now(), 0), maxDelayMs),
      );
      if (background) handle.unref();
    };
    arm();
    return () => clearTimeout(handle);
  };
  return { now, setTimer };
};
