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
 * And the process's Postgres pool (`poolLimitsFromEnvironment`), over
 * `defaultPoolLimits`:
 *
 * - `DURABLE_AGENTS_PG_POOL_MAX` (32): connections the pool opens at most,
 *   `pg`'s `max`.
 * - `DURABLE_AGENTS_PG_POOL_WAIT_MS` (10000): how long a query waits for a
 *   connection, a free one or a new one, before it fails; `pg`'s
 *   `connectionTimeoutMillis`.
 *
 * A value that is not a number of the right kind throws, so a typo does not
 * silently run on the default.
 */
import {
  defaultServerLimits,
  type DurableAgentsServerLimits,
} from "../durable-agents-server";

import type { PoolConfig } from "pg";

type Environment = Readonly<Record<string, string | undefined>>;

const variables = {
  maxTurns: "DURABLE_AGENTS_MAX_TURNS",
  maxConcurrentRequests: "DURABLE_AGENTS_MAX_CONCURRENT_REQUESTS",
  abandonedTurnMs: "DURABLE_AGENTS_ABANDONED_TURN_MS",
  crashLoopRestarts: "DURABLE_AGENTS_CRASH_LOOP_RESTARTS",
} as const satisfies Record<keyof DurableAgentsServerLimits, string>;

/** The pool's limits, as `pg` names them. */
export type PoolLimits = Required<
  Pick<PoolConfig, "max" | "connectionTimeoutMillis">
>;

export const defaultPoolLimits: PoolLimits = {
  max: 32,
  connectionTimeoutMillis: 10_000,
};

const poolVariables = {
  max: "DURABLE_AGENTS_PG_POOL_MAX",
  connectionTimeoutMillis: "DURABLE_AGENTS_PG_POOL_WAIT_MS",
} as const satisfies Record<keyof PoolLimits, string>;

const parse = (
  environment: Environment,
  name: string,
  fallback: number,
  { infinite }: { readonly infinite: boolean },
): number => {
  const raw = environment[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  if (infinite && raw.trim() === "Infinity") return Infinity;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(
      `${name} must be an integer of 1 or more${infinite ? " or Infinity" : ""}: ${raw}.`,
    );
  return value;
};

export const limitsFromEnvironment = (
  environment: Environment,
): DurableAgentsServerLimits => ({
  maxTurns: parse(
    environment,
    variables.maxTurns,
    defaultServerLimits.maxTurns,
    { infinite: false },
  ),
  maxConcurrentRequests: parse(
    environment,
    variables.maxConcurrentRequests,
    defaultServerLimits.maxConcurrentRequests,
    { infinite: false },
  ),
  abandonedTurnMs: parse(
    environment,
    variables.abandonedTurnMs,
    defaultServerLimits.abandonedTurnMs,
    { infinite: false },
  ),
  crashLoopRestarts: parse(
    environment,
    variables.crashLoopRestarts,
    defaultServerLimits.crashLoopRestarts,
    { infinite: true },
  ),
});

/** The pool's limits from the environment, to spread over its connection config. */
export const poolLimitsFromEnvironment = (
  environment: Environment,
): PoolLimits => ({
  max: parse(environment, poolVariables.max, defaultPoolLimits.max, {
    infinite: false,
  }),
  connectionTimeoutMillis: parse(
    environment,
    poolVariables.connectionTimeoutMillis,
    defaultPoolLimits.connectionTimeoutMillis,
    { infinite: false },
  ),
});
