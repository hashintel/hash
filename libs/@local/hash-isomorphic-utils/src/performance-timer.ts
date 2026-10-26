/**
 * A utility to measure performance between checkpoints in code.
 *
 * Logs using console.debug
 *
 * Usage:
 *
 * const { checkpoint, done } = createPerformanceTimer();
 * // do work
 * checkpoint("Checkpoint 1");
 * // do work
 * checkpoint("Checkpoint 2")
 * // do work
 * done()
 */
export interface PerformanceTimer {
  checkpoint: (label: string) => void;
  done: () => void;
}

export const createPerformanceTimer = (): PerformanceTimer => {
  const start = performance.now();

  let previous = { time: start, label: "Start" };

  const checkpoint = (label: string): void => {
    const now = performance.now();

    // eslint-disable-next-line no-console -- debug logging is the purpose of this utility
    console.debug(
      `${previous.label} to ${label} took ${(now - previous.time).toFixed(2)}ms (total ${(now - start).toFixed(2)})`,
    );

    previous = { time: now, label };
  };

  return {
    checkpoint,
    done: () => {
      checkpoint("End");
    },
  };
};
