/**
 * Cooperative yielding for long main-thread loops.
 *
 * Batch instantiation loops over every run of a rung; at a million runs even
 * tight typed-array loops hold the main thread for hundreds of milliseconds,
 * which the user feels as a frozen page. Interleaving a yield keeps each
 * task under the frame budget while the loop's total cost stays the same.
 *
 * The clock is read only when the caller asks (`shouldYield`), so callers
 * gate the check on an iteration stride and pay nothing per iteration:
 *
 * ```ts
 * const yielder = createCooperativeYielder();
 * for (let run = 0; run < runCount; run++) {
 *   if (run % 1024 === 0 && yielder.shouldYield()) {
 *     await yielder.yieldNow();
 *   }
 *   // ...the run's work...
 * }
 * ```
 */

type SchedulerHost = {
  scheduler?: { yield?: () => Promise<void> };
  performance?: { now: () => number };
  document?: { visibilityState?: string };
};

const host = globalThis as SchedulerHost;

const now = (): number => host.performance?.now() ?? Date.now();

export type CooperativeYielder = {
  /** Whether the current task has held the thread past the budget. */
  shouldYield(): boolean;
  /** Yields to the event loop and restarts the budget. */
  yieldNow(): Promise<void>;
};

export function createCooperativeYielder(budgetMs = 8): CooperativeYielder {
  let taskStart = now();
  return {
    // A hidden document has no one to feel jank, and its `setTimeout`
    // fallback is throttled to ~1 s per yield — yielding there would turn a
    // 3 s build into minutes. Run straight through instead.
    shouldYield: () =>
      host.document?.visibilityState !== "hidden" &&
      now() - taskStart >= budgetMs,
    yieldNow: async () => {
      // `scheduler.yield` continues at front-of-queue with input handling
      // interleaved; the timeout fallback is a plain macrotask.
      await (host.scheduler?.yield?.() ??
        new Promise((resolve) => {
          setTimeout(resolve, 0);
        }));
      taskStart = now();
    },
  };
}
