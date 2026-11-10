/**
 * The durable agents server process: `yarn start` (`tsx src/main.ts`).
 *
 * Every environment variable it reads, with its default:
 *
 * - `PORT` (4323): where it listens.
 * - `DURABLE_AGENTS_MODEL` (required): a new conversation's model,
 *   `<provider>/<modelId>` from pi-ai's built-in catalog (for example
 *   `anthropic/claude-sonnet-4-5`). Each provider reads its own credentials
 *   from its usual environment variables (`ANTHROPIC_API_KEY`,
 *   `OPENAI_API_KEY`, …) when a turn calls it; no request is made before
 *   then.
 * - The server's limits (`limitsFromEnvironment`), integers of 1 or more:
 *   - `DURABLE_AGENTS_MAX_TURNS` (25): tool rounds one run takes at most.
 *   - `DURABLE_AGENTS_MAX_CONCURRENT_REQUESTS` (16): model requests in
 *     flight at once.
 *   - `DURABLE_AGENTS_ABANDONED_TURN_MS` (600000): how long a running turn
 *     goes unwatched before it is aborted.
 *   - `DURABLE_AGENTS_CRASH_LOOP_RESTARTS` (5, or `Infinity` for never):
 *     restarts in a row after which a task's work is aborted.
 * - The Postgres pool (`poolLimitsFromEnvironment`), integers of 1 or more:
 *   - `DURABLE_AGENTS_PG_POOL_MAX` (32): connections at most, `pg`'s `max`.
 *   - `DURABLE_AGENTS_PG_POOL_WAIT_MS` (10000): how long a query waits for
 *     a connection, `pg`'s `connectionTimeoutMillis`. An HTTP request that
 *     waits longer is answered 503 with `Retry-After`.
 * - The Postgres connection (`postgresConfigFromEnvironment`), each Brunch's
 *   variable first, then compose's, then the compose default:
 *   - `BRUNCH_POSTGRES_HOST` (`localhost`).
 *   - `BRUNCH_POSTGRES_PORT`, then `POSTGRES_PORT` (5432).
 *   - `BRUNCH_POSTGRES_USER`, then `POSTGRES_USER` (`postgres`).
 *   - `BRUNCH_POSTGRES_PASSWORD`, then `POSTGRES_PASSWORD` (`postgres`).
 *   - `BRUNCH_POSTGRES_DATABASE` (`postgres`).
 *
 * A crash-loop abort is logged as one JSON line on stderr
 * (`"event": "durable-agents.crash-loop"`).
 *
 * SIGTERM and SIGINT stop serving, close every conversation and end the pool.
 */
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { Pool } from "pg";

import { startDurableAgentsServer } from "./server/start-durable-agents-server";
import { poolLimitsFromEnvironment } from "./server/start-durable-agents-server/limits-from-environment";
import { postgresConfigFromEnvironment } from "./storage/postgres/postgres-config";

const defaultPort = 4323;

const modelFromEnvironment = (
  models: ReturnType<typeof builtinModels>,
  value: string | undefined,
) => {
  const separator = value?.indexOf("/") ?? -1;
  if (value === undefined || separator <= 0)
    throw new Error(
      "Set DURABLE_AGENTS_MODEL to <provider>/<modelId>, for example anthropic/claude-sonnet-4-5.",
    );
  const model = {
    provider: value.slice(0, separator),
    modelId: value.slice(separator + 1),
  };
  if (models.getModel(model.provider, model.modelId) === undefined)
    throw new Error(`DURABLE_AGENTS_MODEL names no known model: ${value}.`);
  return model;
};

const models = builtinModels();
const model = modelFromEnvironment(models, process.env.DURABLE_AGENTS_MODEL);
const port = Number(process.env.PORT ?? defaultPort);
const pool = new Pool({
  ...postgresConfigFromEnvironment(),
  ...poolLimitsFromEnvironment(process.env),
});

const server = await startDurableAgentsServer({
  port,
  pool,
  models,
  model,
  onCrashLoop: (conversationId, tasks) => {
    process.stderr.write(
      `${JSON.stringify({
        level: "warn",
        event: "durable-agents.crash-loop",
        message:
          "Aborted a conversation's work: a task was cut off by a restart too often.",
        conversationId,
        tasks,
      })}\n`,
    );
  },
});
process.stdout.write(
  `Durable agents server on http://localhost:${server.port} (model ${model.provider}/${model.modelId})\n`,
);

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await server.close();
  await pool.end();
};
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    void stop().then(
      () => process.exit(0),
      (error: unknown) => {
        process.stderr.write(`${String(error)}\n`);
        process.exit(1);
      },
    );
  });
}
