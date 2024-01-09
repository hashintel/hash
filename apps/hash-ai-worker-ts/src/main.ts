import * as http from "node:http";
import * as path from "node:path";

import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { Logger } from "@local/hash-backend-utils/logger";
import { NativeConnection, Worker } from "@temporalio/worker";
import { config } from "dotenv-flow";

import { createAiActivities, createGraphActivities } from "./activities";

export const monorepoRootDir = path.resolve(__dirname, "../../..");

config({ silent: true, path: monorepoRootDir });

const TEMPORAL_HOST = process.env.HASH_TEMPORAL_HOST ?? "localhost";
const TEMPORAL_PORT = process.env.HASH_TEMPORAL_PORT
  ? parseInt(process.env.HASH_TEMPORAL_PORT, 10)
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

const logger = new Logger({
  mode: process.env.NODE_ENV === "production" ? "prod" : "dev",
  serviceName: "hash-ai-worker-ts",
});

async function run() {
  const graphApiClient = createGraphClient(logger, {
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
    },
    connection: await NativeConnection.connect({
      address: `${TEMPORAL_HOST}:${TEMPORAL_PORT}`,
    }),
    namespace: "HASH",
    taskQueue: "ai",
  });

  const httpServer = createHealthCheckServer();
  const port = 4100;
  httpServer.listen({ host: "::", port });
  // eslint-disable-next-line no-console
  console.info(`HTTP server listening on port ${port}`);

  await worker.run();
}

process.on("SIGINT", () => process.exit(1));
process.on("SIGTERM", () => process.exit(1));

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
