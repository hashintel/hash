import { createServer } from "node:http";
import { promisify } from "node:util";

import { EntityType } from "@blockprotocol/type-system";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { Entity } from "@local/hash-backend-utils/pg-tables";
import { generateStreamConsumers } from "@local/hash-backend-utils/realtime";
import { RedisConfig } from "@local/hash-backend-utils/redis";
import { GracefulShutdown } from "@local/hash-backend-utils/shutdown";
import dedent from "dedent";
import { Configuration, OpenAIApi } from "openai";

import { INSTANCE_ID, logger } from "./config";
import { QdrantDb } from "./vector/qdrant";
import {
  HandlerParameters,
  handleEntityChange,
  handleEntityTypeChange,
  handlePropertyTypeChange,
} from "./change-handlers";

// Environment variables
const PORT = process.env.HASH_VECTOR_LOADER_PORT ?? 3434;

const REDIS_HOST = process.env.HASH_REDIS_HOST ?? "localhost";
const REDIS_PORT = parseInt(process.env.HASH_REDIS_PORT ?? "6379", 10);

const QDRANT_HOST = getRequiredEnv("HASH_QDRANT_HOST");
const QDRANT_PORT = parseInt(getRequiredEnv("HASH_QDRANT_PORT"), 10);

const shutdown = new GracefulShutdown(logger, "SIGINT", "SIGTERM");

const createHttpServer = () => {
  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(
        JSON.stringify({
          msg: "Server is up",
          instanceId: INSTANCE_ID,
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end("");
  });

  return server;
};

const main = async () => {
  logger.info("STARTED");

  // Start a HTTP server
  const httpServer = createHttpServer();
  httpServer.listen({ host: "::", port: PORT });
  logger.info(`HTTP server listening on port ${PORT}`);
  shutdown.addCleanup("HTTP server", async () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- the method is unbound and then bound
    await promisify(httpServer.close).bind(httpServer)();
  });

  const qdrantClient = new QdrantDb(logger, {
    host: QDRANT_HOST,
    port: QDRANT_PORT,
  });

  // Create indexes
  // OAI ADA embeddings are 1536-dimensional
  await Promise.all(
    VECTORDB_INDEX_NAMES.map((indexName) =>
      qdrantClient.createIndex(indexName, 1536, "Cosine"),
    ),
  );

  // Prepare OpenAI connection
  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const openai = new OpenAIApi(configuration);

  // Connect to Redis
  const redisConfig: RedisConfig = {
    host: REDIS_HOST,
    port: REDIS_PORT,
  };

  const { entityStream, entityTypeStream, propertyTypeStream } =
    generateStreamConsumers(logger, redisConfig);

  const handlerParams = {
    logger,
    openai,
    vectorDb: qdrantClient,
  } satisfies HandlerParameters;

  await Promise.all([
    handleEntityChange({
      ...handlerParams,
      consumer: entityStream,
    }),
    handleEntityTypeChange({
      ...handlerParams,
      consumer: entityTypeStream,
    }),
    handlePropertyTypeChange({
      ...handlerParams,
      consumer: propertyTypeStream,
    }),
  ]);
};

void (async () => {
  try {
    await main();
  } catch (err) {
    logger.error(err);
  } finally {
    await shutdown.trigger();
  }
})();
