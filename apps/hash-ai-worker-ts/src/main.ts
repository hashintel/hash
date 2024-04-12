/* eslint-disable import/first */

import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.HASH_TEMPORAL_WORKER_AI_SENTRY_DSN,
  enabled: !!process.env.HASH_TEMPORAL_WORKER_AI_SENTRY_DSN,
  tracesSampleRate: 1.0,
});

import * as http from "node:http";
import { createRequire } from "node:module";
import * as path from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { SentryActivityInboundInterceptor } from "@local/hash-backend-utils/temporal/interceptors/activities/sentry";
import { sentrySinks } from "@local/hash-backend-utils/temporal/sinks/sentry";
import { defaultSinks, NativeConnection, Worker } from "@temporalio/worker";
import { config } from "dotenv-flow";

import { createAiActivities, createGraphActivities } from "./activities";
import { createFlowActivities } from "./activities/flow-activities";
import { logger, logToConsole } from "./shared/logger";

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

const workflowOption = () =>
  process.env.NODE_ENV === "production"
    ? {
        workflowBundle: {
          codePath: require.resolve("../dist/workflow-bundle.js"),
        },
      }
    : { workflowsPath: require.resolve("./workflows") };

async function run() {
  const graphApiClient = createGraphClient(logToConsole, {
    host: getRequiredEnv("HASH_GRAPH_API_HOST"),
    port: parseInt(getRequiredEnv("HASH_GRAPH_API_PORT"), 10),
  });

  const worker = await Worker.create({
    ...workflowOption(),
    activities: {
      ...createAiActivities({
        graphApiClient,
      }),
      ...createGraphActivities({
        graphApiClient,
      }),
      ...createFlowActivities({
        graphApiClient,
      }),
    },
    connection: await NativeConnection.connect({
      address: `${TEMPORAL_HOST}:${TEMPORAL_PORT}`,
    }),
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

  logger.info(`HTTP server listening on port ${port}`);

  await worker.run();
}

process.on("SIGINT", () => process.exit(1));
process.on("SIGTERM", () => process.exit(1));

run().catch((err) => {
  logToConsole.error(err);
  process.exit(1);
});
