/**
 * The server's limits from the process environment, each over its default
 * (`defaultServerLimits`):
 *
 * - `DURABLE_AGENTS_MAX_TURNS` (100): tool rounds one run takes at most.
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
  type Environment,
  integerFromEnvironment,
} from "../../shared/integer-from-environment";
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

export const limitsFromEnvironment = (
  environment: Environment,
): DurableAgentsServerLimits => ({
  maxTurns: integerFromEnvironment(
    environment,
    variables.maxTurns,
    defaultServerLimits.maxTurns,
    { infinite: false },
  ),
  maxConcurrentRequests: integerFromEnvironment(
    environment,
    variables.maxConcurrentRequests,
    defaultServerLimits.maxConcurrentRequests,
    { infinite: false },
  ),
  abandonedTurnMs: integerFromEnvironment(
    environment,
    variables.abandonedTurnMs,
    defaultServerLimits.abandonedTurnMs,
    { infinite: false },
  ),
  crashLoopRestarts: integerFromEnvironment(
    environment,
    variables.crashLoopRestarts,
    defaultServerLimits.crashLoopRestarts,
    { infinite: true },
  ),
});
