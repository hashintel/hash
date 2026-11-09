/**
 * The server's limits from the process environment, each over its default
 * (`defaultServerLimits`):
 *
 * - `DURABLE_AGENTS_MAX_TURNS` (25): tool rounds one run takes at most.
 * - `DURABLE_AGENTS_MAX_CONCURRENT_REQUESTS` (16): model requests in flight
 *   at once in the process.
 * - `DURABLE_AGENTS_ABANDONED_TURN_MS` (600000, ten minutes): how long a
 *   running turn goes unwatched, with no claimed browser call, before it is
 *   aborted.
 * - `DURABLE_AGENTS_CRASH_LOOP_RESTARTS` (5): restarts in a row after which
 *   a task's work is aborted when its conversation opens; `Infinity` never.
 *
 * A value that is not a number of the right kind throws, so a typo does not
 * silently run on the default.
 */
import {
  defaultServerLimits,
  type DurableAgentsServerLimits,
} from "../durable-agents-server";

const variables = {
  maxTurns: "DURABLE_AGENTS_MAX_TURNS",
  maxConcurrentRequests: "DURABLE_AGENTS_MAX_CONCURRENT_REQUESTS",
  abandonedTurnMs: "DURABLE_AGENTS_ABANDONED_TURN_MS",
  crashLoopRestarts: "DURABLE_AGENTS_CRASH_LOOP_RESTARTS",
} as const satisfies Record<keyof DurableAgentsServerLimits, string>;

const parse = (
  name: string,
  raw: string | undefined,
  fallback: number,
  { infinite }: { readonly infinite: boolean },
): number => {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = raw.trim() === "Infinity" && infinite ? Infinity : Number(raw);
  if (!(value === Infinity || (Number.isInteger(value) && value >= 1)))
    throw new Error(
      `${name} must be an integer of 1 or more${infinite ? " or Infinity" : ""}: ${raw}.`,
    );
  return value;
};

export const limitsFromEnvironment = (
  environment: Readonly<Record<string, string | undefined>>,
): DurableAgentsServerLimits => ({
  maxTurns: parse(
    variables.maxTurns,
    environment[variables.maxTurns],
    defaultServerLimits.maxTurns,
    { infinite: false },
  ),
  maxConcurrentRequests: parse(
    variables.maxConcurrentRequests,
    environment[variables.maxConcurrentRequests],
    defaultServerLimits.maxConcurrentRequests,
    { infinite: false },
  ),
  abandonedTurnMs: parse(
    variables.abandonedTurnMs,
    environment[variables.abandonedTurnMs],
    defaultServerLimits.abandonedTurnMs,
    { infinite: false },
  ),
  crashLoopRestarts: parse(
    variables.crashLoopRestarts,
    environment[variables.crashLoopRestarts],
    defaultServerLimits.crashLoopRestarts,
    { infinite: true },
  ),
});
