/* eslint-disable import/first */

import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.HASH_TEMPORAL_WORKER_AI_SENTRY_DSN,
  enabled: !!process.env.HASH_TEMPORAL_WORKER_AI_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 1.0 : 0,
});

import * as http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { createCommonFlowActivities } from "@local/hash-backend-utils/flows";
import { SentryActivityInboundInterceptor } from "@local/hash-backend-utils/temporal/interceptors/activities/sentry";
import { sentrySinks } from "@local/hash-backend-utils/temporal/sinks/sentry";
import { createVaultClient } from "@local/hash-backend-utils/vault";
import type { WorkerOptions } from "@temporalio/worker";
import { defaultSinks, NativeConnection, Worker } from "@temporalio/worker";
import { config } from "dotenv-flow";
import { TsconfigPathsPlugin } from "tsconfig-paths-webpack-plugin";

import {
  createAiActivities,
  createDashboardConfigurationActivities,
  createGraphActivities,
} from "./activities.js";
import { createFlowActivities } from "./activities/flow-activities.js";
import { logger } from "./shared/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);

export const monorepoRootDir = path.resolve(__dirname, "../../..");

config({ silent: true, path: monorepoRootDir });

const TEMPORAL_HOST = new URL(
  process.env.HASH_TEMPORAL_SERVER_HOST ?? "http://localhost",
).hostname;
const TEMPORAL_PORT = process.env.HASH_TEMPORAL_SERVER_PORT
  ? parseInt(process.env.HASH_TEMPORAL_SERVER_PORT, 10)
  : 7233;

const createHealthCheckServer = () => {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(
        JSON.stringify({
          msg: "worker healthy",
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end("");
  });

  return server;
};

const workflowOptions: Partial<WorkerOptions> =
  process.env.NODE_ENV === "production"
    ? {
        workflowBundle: {
          codePath: require.resolve("../dist/workflow-bundle.js"),
        },
      }
    : {
        bundlerOptions: {
          webpackConfigHook: (webpackConfig) => {
            return {
              ...webpackConfig,
              resolve: {
                ...webpackConfig.resolve,
                plugins: [
                  ...((webpackConfig.plugins as [] | undefined) ?? []),
                  /**
                   * Because we run TypeScript directly in development, we need to use the 'paths' in the base tsconfig.json
                   * This tells TypeScript where to resolve the imports from, overwriting the 'exports' in local dependencies' package.jsons,
                   * which refer to the transpiled JavaScript code. This plugin converts the 'paths' to webpack 'alias'.
                   */
                  new TsconfigPathsPlugin({
                    configFile:
                      "../../libs/@local/tsconfig/legacy-base-tsconfig-to-refactor.json",
                  }),
                ],
              },
            };
          },
        },
        workflowsPath: require.resolve("./workflows"),
      };

async function run() {
  logger.info("Starting AI worker...");

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

  const connection = await NativeConnection.connect({
    address: `${TEMPORAL_HOST}:${TEMPORAL_PORT}`,
  });
  logger.info("Created Temporal connection");

  const worker = await Worker.create({
    ...workflowOptions,
    activities: {
      ...createAiActivities({
        graphApiClient,
      }),
      ...createGraphActivities({
        graphApiClient,
      }),
      ...createFlowActivities({ vaultClient }),
      ...createCommonFlowActivities({ graphApiClient }),
      ...createDashboardConfigurationActivities({ graphApiClient }),
    },
    connection,
    /**
     * The maximum time that may elapse between heartbeats being processed by the server.
     * The default maxHeartbeatThrottleInterval is 60s.
     * Throttling is also capped at 80% of the heartbeatTimeout set when proxying an activity.
     */
    maxHeartbeatThrottleInterval: "10 seconds",
    namespace: "HASH",
    taskQueue: "ai",
    sinks: { ...defaultSinks(), ...sentrySinks() },
    interceptors: {
      workflowModules: [
        require.resolve(
          "@local/hash-backend-utils/temporal/interceptors/workflows/sentry",
        ),
      ],
      activityInbound: [(ctx) => new SentryActivityInboundInterceptor(ctx)],
    },
  });

  const httpServer = createHealthCheckServer();
  const port = 4100;
  httpServer.listen({ host: "0.0.0.0", port });

  logger.info(`HTTP server listening on port ${port}`);

  await worker.run();
}

process.on("SIGINT", () => {
  logger.info("Received SIGINT, exiting...");
  process.exit(1);
});
process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, exiting...");
  process.exit(1);
});

run().catch((err) => {
  logger.error(`Error running worker: ${err}`);
  process.exit(1);
});
