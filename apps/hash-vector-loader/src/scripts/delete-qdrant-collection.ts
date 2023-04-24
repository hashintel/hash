/**
 * This script clears all indices created by the vector-loader service. It is intended
 * for use during development.
 */
import { Logger } from "@local/hash-backend-utils/logger";
import { getRequiredEnv } from "../../../../libs/@local/hash-backend-utils/src/environment";
import { QdrantDb } from "../vector/qdrant";
import { VECTORDB_INDEX_NAME } from "../main";

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

  await qdrantClient.deleteIndex(VECTORDB_INDEX_NAME);
};

main().catch(logger.error);
