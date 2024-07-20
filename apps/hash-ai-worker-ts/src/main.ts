/* eslint-disable import/first */

import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.HASH_TEMPORAL_WORKER_AI_SENTRY_DSN,
  enabled: Boolean(process.env.HASH_TEMPORAL_WORKER_AI_SENTRY_DSN),
  tracesSampleRate: 1.0,
});

import * as http from "node:http";
import { createRequire } from "node:module";
import * as path from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv-flow";
import { TsconfigPathsPlugin } from "tsconfig-paths-webpack-plugin";
import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { SentryActivityInboundInterceptor } from "@local/hash-backend-utils/temporal/interceptors/activities/sentry";
import { sentrySinks } from "@local/hash-backend-utils/temporal/sinks/sentry";
import { createVaultClient } from "@local/hash-backend-utils/vault";
import type {
  BundleOptions,
  defaultSinks,
  NativeConnection,
  Worker,
} from "@temporalio/worker";

import { createAiActivities, createGraphActivities } from "./activities.js";
import { createFlowActivities } from "./activities/flow-activities.js";
import { logToConsole } from "./shared/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  const server = http.createServer((request, res) => {
    if (request.method === "GET" && request.url === "/health") {
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

const workflowOptions =
  process.env.NODE_ENV === "production"
    ? {
        workflowBundle: {
          codePath: require.resolve("../dist/workflow-bundle.js"),
        },
      }
    : ({
        webpackConfigHook: (webpackConfig) => {
          /* eslint-disable no-param-reassign */
          webpackConfig.resolve ??= {};
          webpackConfig.resolve.plugins ??= [];
          /* eslint-enable no-param-reassign */
          /**
           * Because we run TypeScript directly in development, we need to use the 'paths' in the base tsconfig.json
           * This tells TypeScript where to resolve the imports from, overwriting the 'exports' in local dependencies' package.jsons,
           * which refer to the transpiled JavaScript code.
           */
          webpackConfig.resolve.plugins.push(new TsconfigPathsPlugin());

          return webpackConfig;
        },
        workflowsPath: require.resolve("./workflows"),
      } satisfies BundleOptions);

async function run() {
  logToConsole.info("Starting AI worker...");

  const graphApiClient = createGraphClient(logToConsole, {
    host: getRequiredEnv("HASH_GRAPH_API_HOST"),
    port: parseInt(getRequiredEnv("HASH_GRAPH_API_PORT"), 10),
  });

  logToConsole.info("Created Graph client");

  const vaultClient = createVaultClient();

  if (!vaultClient) {
    throw new Error("Vault client not created");
  }

  logToConsole.info("Created Vault client");

  const connection = await NativeConnection.connect({
    address: `${TEMPORAL_HOST}:${TEMPORAL_PORT}`,
  });

  logToConsole.info("Created Temporal connection");

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
    },
    connection,
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

  httpServer.listen({ host: "::", port });

  logToConsole.info(`HTTP server listening on port ${port}`);

  await worker.run();
}

process.on("SIGINT", () => {
  logToConsole.info("Received SIGINT, exiting...");
  process.exit(1);
});
process.on("SIGTERM", () => {
  logToConsole.info("Received SIGTERM, exiting...");
  process.exit(1);
});

run().catch((error) => {
  logToConsole.error(`Error running worker: ${error}`);
  process.exit(1);
});
