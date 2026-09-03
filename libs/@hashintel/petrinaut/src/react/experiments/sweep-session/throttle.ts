export type Throttle = {
  /** Runs at once outside a window; inside one, folds into a trailing run. */
  call: () => void;
  /** Drops the pending trailing run, if any. */
  cancel: () => void;
};

/**
 * Leading-edge throttle with trailing coalescing: the first call runs
 * immediately and opens a window of `windowMs`; calls inside the window fold
 * into one run when it closes. A window of 0 runs every call.
 */
export const createThrottle = (run: () => void, windowMs: number): Throttle => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;

  const call = () => {
    if (windowMs === 0) {
      run();
      return;
    }
    if (timer !== null) {
      pending = true;
      return;
    }
    run();
    timer = setTimeout(() => {
      timer = null;
      if (pending) {
        pending = false;
        call();
      }
    }, windowMs);
  };

  return {
    call,
    cancel: () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pending = false;
    },
  };
};
