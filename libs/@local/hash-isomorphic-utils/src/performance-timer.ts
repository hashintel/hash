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
export const createPerformanceTimer = () => {
  const start = performance.now();

  const checkpoints = [
    {
      time: start,
      label: "Start",
    },
  ];

  const checkpoint = (label: string) => {
    const now = performance.now();
    const previous = checkpoints.at(-1)!;

    checkpoints.push({ time: now, label });

    // eslint-disable-next-line no-console
    console.debug(
      `${previous.label} to ${label} took ${(now - previous.time).toFixed(2)}ms (total ${(now - start).toFixed(2)})`,
    );
  };

  return {
    checkpoint,
    done: () => {
      return checkpoint("End");
    },
  };
};
