import type { ImpureGraphContext } from "@apps/hash-api/src/graph/context-types";
import type { TemporalClient } from "@local/hash-backend-utils/temporal";

/**
 * Seeds the system graph (system policies, system account, ontology migrations
 * and system entities) once, before any test file runs.
 *
 * The `ensureSystemGraphIsInitialized` calls in the individual test files then
 * hit the fast path: migrations which have already been applied are skipped
 * based on the migration state stored on the HASH Instance entity, so they
 * only perform a handful of idempotent checks instead of a full seed.
 *
 * This file runs in a separate process from the test files, so it cannot use
 * vitest APIs (e.g. `vi` – which is why the context is built inline rather
 * than via `createTestImpureGraphContext`) and the environment is not loaded
 * by the `setupFiles` configured in `vitest.config.ts`.
 */
export const setup = async () => {
  /**
   * Load the environment before any `@apps/hash-api` module is evaluated –
   * some of them read environment variables at module scope. The imports are
   * dynamic so that import sorting cannot hoist those modules above the
   * environment module.
   */
  const { getRequiredEnv } =
    await import("@local/hash-backend-utils/environment");

  const { Logger } = await import("@local/hash-backend-utils/logger");
  const { createGraphClient } =
    await import("@local/hash-backend-utils/create-graph-client");
  const { ensureSystemGraphIsInitialized } =
    await import("@apps/hash-api/src/graph/ensure-system-graph-is-initialized");

  const logger = new Logger({
    environment: "test",
    level: "debug",
    serviceName: "integration-tests",
  });

  const graphApi = createGraphClient(logger, {
    host: getRequiredEnv("HASH_GRAPH_HTTP_HOST"),
    port: parseInt(getRequiredEnv("HASH_GRAPH_HTTP_PORT"), 10),
  });

  const context: ImpureGraphContext<false, true> = {
    graphApi,
    provenance: {
      actorType: "machine",
      origin: {
        type: "api",
      },
    },
    // Seeding the system graph does not execute Temporal workflows – mirror
    // the no-op mock used by `createTestImpureGraphContext` in the test files.
    temporalClient: {
      workflow: {
        execute: () => Promise.resolve(),
      },
    } as unknown as TemporalClient,
  };

  await ensureSystemGraphIsInitialized({
    logger,
    context,
    seedSystemPolicies: true,
  });
};
