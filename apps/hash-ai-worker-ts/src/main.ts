/* eslint-disable import/first, import/order, simple-import-sort/imports */

// Must be the first import so OTEL auto-instrumentations can patch
// http / grpc / Sentry's own monkey-patches before they apply.
import { otelSetup } from "./instrument.js";

import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.HASH_TEMPORAL_WORKER_AI_SENTRY_DSN,
  enabled: !!process.env.HASH_TEMPORAL_WORKER_AI_SENTRY_DSN,
  environment:
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    process.env.SENTRY_ENVIRONMENT ||
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    process.env.ENVIRONMENT ||
    (process.env.NODE_ENV === "production" ? "production" : "development"),
  tracesSampleRate: process.env.NODE_ENV === "production" ? 1.0 : 0,
  // Sentry registers its own global `NodeTracerProvider` by default.
  // Letting it run after `registerOpenTelemetry` would replace the
  // provider that the OTEL workflow client interceptor (set up in
  // `createTemporalClient`) holds via `trace.getTracer(...)`, breaking
  // caller → workflow → activity context propagation. With this flag
  // Sentry shares our provider so its spans flow through the same
  // OTLP pipeline.
  skipOpenTelemetrySetup: !!otelSetup,
});

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { createCommonFlowActivities } from "@local/hash-backend-utils/flows";
import type { WorkflowSource } from "@local/hash-backend-utils/temporal/worker-bootstrap";
import { runWorker } from "@local/hash-backend-utils/temporal/worker-bootstrap";
import { createVaultClient } from "@local/hash-backend-utils/vault";
import { config } from "dotenv-flow";
import { TsconfigPathsPlugin } from "tsconfig-paths-webpack-plugin";

import { createAiActivities, createGraphActivities } from "./activities.js";
import { createFlowActivities } from "./activities/flow-activities.js";
import { logger } from "./shared/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);

export const monorepoRootDir = path.resolve(__dirname, "../../..");

config({ silent: true, path: monorepoRootDir });

const workflowSource: WorkflowSource =
  process.env.NODE_ENV === "production"
    ? {
        kind: "bundle",
        bundle: { codePath: require.resolve("../dist/workflow-bundle.js") },
      }
    : {
        kind: "path",
        workflowsPath: require.resolve("./workflows"),
        bundlerOptions: {
          webpackConfigHook: (webpackConfig) => ({
            ...webpackConfig,
            resolve: {
              ...webpackConfig.resolve,
              plugins: [
                ...((webpackConfig.plugins as [] | undefined) ?? []),
                /**
                 * We run TypeScript directly in development, so the 'paths' in
                 * the base tsconfig.json need to be honoured to override the
                 * 'exports' in local dependencies' package.jsons (which point
                 * at transpiled JavaScript). This plugin converts the 'paths'
                 * to webpack 'alias'.
                 */
                new TsconfigPathsPlugin({
                  configFile:
                    "../../libs/@local/tsconfig/legacy-base-tsconfig-to-refactor.json",
                }),
              ],
            },
          }),
        },
      };

async function run() {
  const graphApiClient = createGraphClient(logger, {
    host: getRequiredEnv("HASH_GRAPH_HTTP_HOST"),
    port: parseInt(getRequiredEnv("HASH_GRAPH_HTTP_PORT"), 10),
  });
  logger.info("Created Graph client");

  const vaultClient = await createVaultClient({ logger });
  if (!vaultClient) {
    throw new Error("Failed to create Vault client, check preceding logs.");
  }
  logger.info("Created Vault client");

  await runWorker({
    serviceName: "AI worker",
    taskQueue: "ai",
    healthCheckPort: 4100,
    activities: {
      ...createAiActivities({ graphApiClient }),
      ...createGraphActivities({ graphApiClient }),
      ...createFlowActivities({ vaultClient }),
      ...createCommonFlowActivities({ graphApiClient }),
    },
    workflowSource,
    workerOptions: {
      /**
       * Maximum interval between heartbeats being processed by the server.
       * Default `maxHeartbeatThrottleInterval` is 60s; throttling is also
       * capped at 80% of `heartbeatTimeout` set when proxying an activity.
       */
      maxHeartbeatThrottleInterval: "10 seconds",
    },
    otelSetup,
    logger,
  });
}

run().catch((error: unknown) => {
  logger.error("Error running worker", { error });
  process.exit(1);
});
