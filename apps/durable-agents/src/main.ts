/**
 * The durable agents server process: `yarn start` (`tsx src/main.ts`).
 *
 * - `PORT`: where it listens, 4323 by default.
 * - `DURABLE_AGENTS_MODEL`: a new conversation's model, `<provider>/<modelId>`
 *   from pi-ai's built-in catalog (for example `anthropic/claude-sonnet-4-5`).
 *   Required. Each provider reads its own credentials from its usual
 *   environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, …) when a
 *   turn calls it; no request is made before then.
 * - Postgres: `BRUNCH_POSTGRES_*`, then compose's `POSTGRES_*`, then the
 *   compose defaults (`postgresConfigFromEnvironment`).
 *
 * SIGTERM and SIGINT stop serving, close every conversation and end the pool.
 */
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { Pool } from "pg";

import { startDurableAgentsServer } from "./server/start-durable-agents-server";
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
const pool = new Pool(postgresConfigFromEnvironment());

const server = await startDurableAgentsServer({ port, pool, models, model });
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
