/**
 * The durable agents server process: `yarn start` (`tsx src/main.ts`).
 *
 * Every environment variable it reads, with its default:
 *
 * - `PORT` (4324): the port on IPv4 loopback (`127.0.0.1`).
 * - `DURABLE_AGENTS_TRUST_PROXY` (unset): `true` when a proxy in front sets
 *   `Host` and `X-Forwarded-Proto`, so request URLs may name them; anything
 *   else names the listener.
 * - HASH's entry (`hashEntryFromEnvironment`), both required:
 *   - `API_ORIGIN`: hash-api's origin, where a request's session cookie is
 *     checked.
 *   - `BRUNCH_HASH_CORS_ALLOWED_ORIGINS`: the comma-separated exact origins
 *     of the HASH pages that may call with their session.
 * - `DURABLE_AGENTS_MODEL` (required): a new conversation's model,
 *   `<provider>/<modelId>` from pi-ai's built-in catalog. Production runs
 *   `openai/gpt-6.1-sol` (H12).
 *   Each provider reads its own credentials from its usual environment
 *   variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, …) when a turn calls
 *   it; no request is made before then. `turbo run start` forwards only the
 *   variables its `turbo.json` task lists, and of the credentials only these
 *   two.
 * - The server's limits (`limitsFromEnvironment`), integers of 1 or more:
 *   - `DURABLE_AGENTS_MAX_TURNS` (100): tool rounds one run takes at most.
 *     HA-3: the model makes one tool call per response, so a realistic net
 *     build takes about one round per element; at 25 a large build would
 *     end `turn_limit`.
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
 * - The Postgres connection (`postgresConfigFromEnvironment`), each durable
 *   agents' variable first, then compose's, then the compose default:
 *   - `DURABLE_AGENTS_POSTGRES_HOST` (`localhost`).
 *   - `DURABLE_AGENTS_POSTGRES_PORT`, then `POSTGRES_PORT` (5432).
 *   - `DURABLE_AGENTS_POSTGRES_USER`, then `POSTGRES_USER` (`postgres`).
 *   - `DURABLE_AGENTS_POSTGRES_PASSWORD`, then `POSTGRES_PASSWORD` (`postgres`).
 *   - `DURABLE_AGENTS_POSTGRES_DATABASE` (`postgres`).
 *
 * Each of these is logged as one JSON line on stderr:
 *
 * - a crash-loop abort (`"event": "durable-agents.crash-loop"`);
 * - each of Pi Durable's reports, with its conversation
 *   (`"event": "durable-agents.report"`);
 * - a stopped conversation's work failing to unwind after its stop answered
 *   (`"event": "durable-agents.stop-error"`);
 * - an idle pool client's error (`"event": "durable-agents.pool-error"`);
 * - a session check hash-api could not answer, answered 503
 *   (`"event": "durable-agents.session-check"`);
 * - an unexpected error a request was answered 500 for
 *   (`"event": "durable-agents.serve-error"`).
 *
 * SIGTERM and SIGINT stop serving, close every conversation and end the pool.
 */
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { Pool } from "pg";

import { startDurableAgentsServer } from "./server/start-durable-agents-server";
import { hashEntryFromEnvironment } from "./server/start-durable-agents-server/hash-entry";
import {
  poolLimitsFromEnvironment,
  postgresConfigFromEnvironment,
} from "./storage/postgres/postgres-config";

const defaultPort = 4324;
const hostname = "127.0.0.1";

const modelFromEnvironment = (
  models: ReturnType<typeof builtinModels>,
  value: string | undefined,
) => {
  const separator = value?.indexOf("/") ?? -1;
  if (value === undefined || separator <= 0)
    throw new Error(
      "Set DURABLE_AGENTS_MODEL to <provider>/<modelId>; production runs openai/gpt-6.1-sol.",
    );
  const model = {
    provider: value.slice(0, separator),
    modelId: value.slice(separator + 1),
  };
  if (models.getModel(model.provider, model.modelId) === undefined)
    throw new Error(`DURABLE_AGENTS_MODEL names no known model: ${value}.`);
  return model;
};

const logLine = (line: Readonly<Record<string, unknown>>) => {
  process.stderr.write(`${JSON.stringify(line)}\n`);
};

const errorText = (error: unknown) =>
  error instanceof Error ? (error.stack ?? error.message) : String(error);

const hashEntry = hashEntryFromEnvironment(process.env);
const models = builtinModels();
const model = modelFromEnvironment(models, process.env.DURABLE_AGENTS_MODEL);
const port = Number(process.env.PORT ?? defaultPort);
const pool = new Pool({
  ...postgresConfigFromEnvironment(),
  ...poolLimitsFromEnvironment(process.env),
});
// Without a listener, an idle client's error crashes the process; the pool has already dropped that client.
pool.on("error", (error) => {
  logLine({
    level: "warn",
    event: "durable-agents.pool-error",
    message: "An idle Postgres client failed; the pool dropped it.",
    error: errorText(error),
  });
});

const server = await startDurableAgentsServer({
  port,
  hostname,
  trustProxy: process.env.DURABLE_AGENTS_TRUST_PROXY === "true",
  onServeError: (error) => {
    logLine({
      level: "error",
      event: "durable-agents.serve-error",
      message: "A request failed unexpectedly; it was answered 500.",
      error: errorText(error),
    });
  },
  pool,
  models,
  model,
  hashEntry: {
    ...hashEntry,
    logWarning: (message, fields) => {
      logLine({
        level: "warn",
        event: "durable-agents.session-check",
        message,
        ...fields,
      });
    },
  },
  onCrashLoop: (conversationId, tasks) => {
    logLine({
      level: "warn",
      event: "durable-agents.crash-loop",
      message:
        "Aborted a conversation's work: a task was cut off by a restart too often.",
      conversationId,
      tasks,
    });
  },
  onReport: (conversationId, { error, ...report }) => {
    logLine({
      level: "error",
      event: "durable-agents.report",
      message: `Pi Durable reported ${report.kind}.`,
      conversationId,
      report,
      error: errorText(error),
    });
  },
  onStopError: (conversationId, error) => {
    logLine({
      level: "error",
      event: "durable-agents.stop-error",
      message:
        "A stopped conversation's work failed to unwind after the stop answered.",
      conversationId,
      error: errorText(error),
    });
  },
});
process.stdout.write(
  `Durable agents server on http://${hostname}:${server.port} (model ${model.provider}/${model.modelId})\n`,
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
