/**
 * This script clears all indices created by the vector-loader service. It is intended
 * for use during development.
 */
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { Logger } from "@local/hash-backend-utils/logger";

import { VECTORDB_INDEX_NAMES } from "../config";
import { QdrantDb } from "../vector/qdrant";

const logger = new Logger({
  serviceName: "delete-qdrant-collection",
  mode: process.env.NODE_ENV === "development" ? "dev" : "prod",
});

const QDRANT_HOST = getRequiredEnv("HASH_QDRANT_HOST");
const QDRANT_PORT = parseInt(getRequiredEnv("HASH_QDRANT_PORT"), 10);

const main = async () => {
  const qdrantClient = new QdrantDb(logger, {
    host: QDRANT_HOST,
    port: QDRANT_PORT,
  });

  await Promise.all(
    VECTORDB_INDEX_NAMES.map((indexName) =>
      qdrantClient.deleteIndex(indexName),
    ),
  );
};

main().catch(logger.error);
