import * as http from "node:http";
import * as path from "node:path";

import { AccountId } from "@local/hash-subgraph";
import { NativeConnection, Worker } from "@temporalio/worker";
import { config } from "dotenv-flow";

import * as activities from "./activities";
import { createImpureGraphContext } from "./activities";

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

async function run() {
  const graphContext = createImpureGraphContext();
  const actorId = await graphContext.graphApi
    .createAccountId()
    .then(({ data }) => data as AccountId);
  const worker = await Worker.create({
    ...workflowOption(),
    activities: activities.createGraphActivities({ graphContext, actorId }),
    connection: await NativeConnection.connect({
      address: `${TEMPORAL_HOST}:${TEMPORAL_PORT}`,
    }),
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
