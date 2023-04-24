import { createServer } from "node:http";
import { promisify } from "node:util";

import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { Entity } from "@local/hash-backend-utils/pg-tables";
import { generateStreamConsumers } from "@local/hash-backend-utils/realtime";
import { RedisConfig } from "@local/hash-backend-utils/redis";
import { GracefulShutdown } from "@local/hash-backend-utils/shutdown";
import dedent from "dedent";
import { Configuration, OpenAIApi } from "openai";

import { INSTANCE_ID, logger } from "./config";
import { QdrantDb } from "./vector/qdrant";

// Environment variables
const PORT = process.env.HASH_VECTOR_LOADER_PORT ?? 3434;

const REDIS_HOST = process.env.HASH_REDIS_HOST ?? "localhost";
const REDIS_PORT = parseInt(process.env.HASH_REDIS_PORT ?? "6379", 10);

const QDRANT_HOST = getRequiredEnv("HASH_QDRANT_HOST");
const QDRANT_PORT = parseInt(getRequiredEnv("HASH_QDRANT_PORT"), 10);

const shutdown = new GracefulShutdown(logger, "SIGINT", "SIGTERM");

export const VECTORDB_INDEX_NAME = "entities";

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

const stringifyEntity = (entity: Entity) => {
  return dedent`
An entity instance with the ID: ${entity.owned_by_id}%${
    entity.entity_uuid
  } at decision time ${entity.decision_time}

has the following properties:
${JSON.stringify(entity.properties)}
`;
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

  // Create index
  // OAI ADA embeddings are 1536-dimensional
  await qdrantClient.createIndex(VECTORDB_INDEX_NAME, 1536, "Cosine");

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

  const { entityStream } = generateStreamConsumers(logger, redisConfig);

  for await (const entity of entityStream) {
    const contents = stringifyEntity(entity);
    const embedding = await openai.createEmbedding({
      input: contents,
      model: "text-embedding-ada-002",
    });
    await qdrantClient.indexVectors(VECTORDB_INDEX_NAME, [
      {
        id: entity.entity_uuid,
        payload: { contents, metadata: entity },
        vector: embedding.data.data[0]!.embedding,
      },
    ]);
    logger.info(`Indexed ${entity.entity_uuid}`);
  }
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
