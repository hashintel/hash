import {
  getRequiredEnv,
  waitOnResource,
} from "@hashintel/hash-backend-utils/environment";
/**
 * This script clears all indices created by the search-loader service. It is intended
 * for use during development.
 */
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { OpenSearch } from "@hashintel/hash-backend-utils/search/opensearch";

if (process.env.HASH_OPENSEARCH_ENABLED !== "true") {
  console.log("Opensearch isn't enabled. Nothing to clear.");
  process.exit(0);
}

const logger = new Logger({
  serviceName: "clear-opensearch",
  mode: process.env.NODE_ENV === "development" ? "dev" : "prod",
});

// Add all indices in the search cluster here
const INDICES = ["entities"];

const main = async () => {
  const host = getRequiredEnv("HASH_OPENSEARCH_HOST");
  const port = parseInt(getRequiredEnv("HASH_OPENSEARCH_PORT"), 10);

  await waitOnResource(`http://${host}:${port}`, logger);

  const searchAuth =
    process.env.HASH_OPENSEARCH_USERNAME === undefined
      ? undefined
      : {
          username: process.env.HASH_OPENSEARCH_USERNAME,
          password: process.env.HASH_OPENSEARCH_PASSWORD ?? "",
        };
  const search = await OpenSearch.connect(logger, {
    host,
    port,
    auth: searchAuth,
    httpsEnabled: !!process.env.HASH_OPENSEARCH_HTTPS_ENABLED,
  });

  try {
    for (const index of INDICES) {
      if (await search.indexExists({ index })) {
        await search.deleteIndex({ index });
      }
      logger.info(`search index "${index}" cleared`);
    }
  } catch (error) {
    console.log("Error deleting one of indexes:", error);
  } finally {
    await search.close();
  }
};

main().catch(logger.error);
