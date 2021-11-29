/**
 * This script clears all indices created by the search-loader service. It is intended
 * for use during development.
 */
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { OpenSearch } from "@hashintel/hash-backend-utils/search/opensearch";

const logger = new Logger({
  serviceName: "clear-opensearch",
  mode: "dev",
  level: "debug",
});

// Add all indices in the search cluster here
const INDICES = ["entities"];

const main = async () => {
  const searchAuth =
    process.env.HASH_OPENSEARCH_USERNAME === undefined
      ? undefined
      : {
          username: process.env.HASH_OPENSEARCH_USERNAME,
          password: process.env.HASH_OPENSEARCH_PASSWORD || "",
        };
  const search = await OpenSearch.connect(logger, {
    host: process.env.HASH_OPENSEARCH_HOST || "localhost",
    port: parseInt(process.env.HASH_OPENSEARCH_PORT || "9200", 10),
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
  } finally {
    await search.close();
  }
};

main().catch(logger.error);
