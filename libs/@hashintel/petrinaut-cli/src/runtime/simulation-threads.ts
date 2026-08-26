/**
 * How many threads a CLI process gives its simulations.
 *
 * The experiment runtime is pure and defaults to one shard, so the CLI — the
 * piece that knows it runs under Node — decides. The default leaves one core
 * for the main thread, which merges shard messages and serves the protocol;
 * `--threads 1` opts out of worker threads entirely and simulates on the
 * calling thread.
 */
import { availableParallelism } from "node:os";

export function defaultSimulationThreads(): number {
  return Math.max(1, availableParallelism() - 1);
}

/**
 * Parses the `--threads` flag value.
 *
 * @throws Error when the value is not a positive integer.
 */
export function resolveSimulationThreads(
  flagValue: string | undefined,
): number {
  if (flagValue === undefined) {
    return defaultSimulationThreads();
  }

  const threads = Number(flagValue);
  if (!Number.isInteger(threads) || threads < 1) {
    throw new Error("--threads requires a positive integer");
  }
  return threads;
}
