/**
 * Splitting an experiment's runs across worker shards.
 *
 * Runs are independent, so an experiment is parallelised by giving each worker a
 * contiguous slice of the run range. Each slice carries its global start index
 * so seeds stay tied to the run's position in the experiment rather than its
 * position within a shard — which is what keeps results identical no matter how
 * many shards are used.
 */

export type MonteCarloShardPlanEntry = {
  /** Index of this shard's first run within the whole experiment. */
  runIndexOffset: number;
  /** How many runs this shard owns. Always at least 1. */
  runCount: number;
};

/**
 * Reads the host's logical core count, where the host exposes one.
 *
 * Returns `null` in environments without the hint (some workers, older
 * runtimes, SSR) so callers can fall back rather than guess.
 */
function detectHardwareConcurrency(): number | null {
  const navigatorLike = (
    globalThis as {
      navigator?: { hardwareConcurrency?: number };
    }
  ).navigator;
  const reported = navigatorLike?.hardwareConcurrency;

  return typeof reported === "number" &&
    Number.isFinite(reported) &&
    reported > 0
    ? Math.floor(reported)
    : null;
}

/**
 * Default shard count for a host whose `navigator` reports a core count.
 *
 * This is a **host-side** helper: the experiment itself never inspects the
 * environment and defaults to one shard, so whoever constructs the worker
 * factory also decides the parallelism. One core is left for the calling
 * thread, which merges shard messages and (in the editor) runs the UI. Hosts
 * without the hint get a single shard. Pass `runCount` to cap the count when
 * it is already known; `planMonteCarloShards` applies the same cap anyway, so
 * an uncapped value is safe to bind before the run count exists.
 */
export function getDefaultMonteCarloShardCount(runCount?: number): number {
  const cores = detectHardwareConcurrency();
  if (cores === null) {
    return 1;
  }

  return Math.max(1, Math.min(runCount ?? Number.POSITIVE_INFINITY, cores - 1));
}

/**
 * Splits `runCount` runs into at most `shardCount` contiguous slices.
 *
 * The remainder is spread one run at a time across the leading shards rather
 * than piled onto the last one, so slice sizes differ by at most one and no
 * single shard becomes the straggler that the whole experiment waits on.
 *
 * @throws Error if `runCount` or `shardCount` is not a positive integer.
 */
export function planMonteCarloShards(
  runCount: number,
  shardCount: number,
): MonteCarloShardPlanEntry[] {
  if (!Number.isInteger(runCount) || runCount <= 0) {
    throw new Error("Monte Carlo shard planning requires a positive runCount");
  }
  if (!Number.isInteger(shardCount) || shardCount <= 0) {
    throw new Error(
      "Monte Carlo shard planning requires a positive shardCount",
    );
  }

  const shards = Math.min(runCount, shardCount);
  const baseSize = Math.floor(runCount / shards);
  const remainder = runCount % shards;

  const plan: MonteCarloShardPlanEntry[] = [];
  let runIndexOffset = 0;
  for (let shard = 0; shard < shards; shard++) {
    const size = baseSize + (shard < remainder ? 1 : 0);
    plan.push({ runIndexOffset, runCount: size });
    runIndexOffset += size;
  }

  return plan;
}
