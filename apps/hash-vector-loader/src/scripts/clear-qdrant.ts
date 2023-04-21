/**
 * This script clears all indices created by the vector-loader service. It is intended
 * for use during development.
 */
import { Logger } from "@local/hash-backend-utils/logger";

const logger = new Logger({
  serviceName: "clear-qdrant",
  mode: process.env.NODE_ENV === "development" ? "dev" : "prod",
});

const main = async () => {};

main().catch(logger.error);
