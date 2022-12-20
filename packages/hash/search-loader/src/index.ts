/* eslint-disable canonical/filename-no-index -- @todo rename file */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import * as http from "node:http";
import { promisify } from "node:util";

import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { RedisQueueExclusiveConsumer } from "@hashintel/hash-backend-utils/queue/redis";
import { AsyncRedisClient } from "@hashintel/hash-backend-utils/redis";
import { ENTITIES_SEARCH_INDEX } from "@hashintel/hash-backend-utils/search/doc-types";
import { OpenSearch } from "@hashintel/hash-backend-utils/search/opensearch";
import { GracefulShutdown } from "@hashintel/hash-backend-utils/shutdown";
import { StatsD } from "hot-shots";

import { INSTANCE_ID, logger } from "./config";
import { SearchLoader } from "./search-loader";

const OPENSEARCH_ENABLED = process.env.HASH_OPENSEARCH_ENABLED === "true";
if (!OPENSEARCH_ENABLED) {
  // eslint-disable-next-line no-console
  console.log("Opensearch is not enabled. Shutting down search-loader");
  process.exit(0);
}

// Environment variables
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing -- @todo refactor this section using envalid */
const PORT = process.env.HASH_SEARCH_LOADER_PORT || 3838;
const REDIS_HOST = getRequiredEnv("HASH_REDIS_HOST");
const REDIS_PORT = parseInt(process.env.HASH_REDIS_PORT || "6379", 10);
const SEARCH_QUEUE_NAME = getRequiredEnv("HASH_SEARCH_QUEUE_NAME");
const STATSD_ENABLED = process.env.STATSD_ENABLED === "1";
const STATSD_HOST = STATSD_ENABLED ? getRequiredEnv("STATSD_HOST") : "";
const STATSD_PORT = parseInt(process.env.STATSD_PORT || "8125", 10);
const OPENSEARCH_HOST = getRequiredEnv("HASH_OPENSEARCH_HOST");
const OPENSEARCH_PORT = parseInt(
  process.env.HASH_OPENSEARCH_PORT || "9200",
  10,
);
const OPENSEARCH_HTTPS_ENABLED =
  process.env.HASH_OPENSEARCH_HTTPS_ENABLED === "1";
const PG_HOST = getRequiredEnv("HASH_PG_HOST");
const PG_PORT = parseInt(getRequiredEnv("HASH_PG_PORT"), 10);
const PG_USER = getRequiredEnv("HASH_PG_USER");
const PG_PASSWORD = getRequiredEnv("HASH_PG_PASSWORD");
const PG_DATABASE = getRequiredEnv("HASH_PG_DATABASE");
/* eslint-enable @typescript-eslint/prefer-nullish-coalescing */

// Configure the StatsD client for reporting metrics
let statsd: StatsD | undefined;
if (STATSD_ENABLED) {
  try {
    statsd = new StatsD({
      host: STATSD_HOST,
      port: STATSD_PORT,
      globalTags: ["search-loader"],
    });
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- error stringification may need improvement
    logger.error(`Could not start StatsD client: ${err}`);
  }
}

const shutdown = new GracefulShutdown(logger, "SIGINT", "SIGTERM");

const createHttpServer = (callbacks: { isQueueAcquired: () => boolean }) => {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/healthcheck") {
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(
        JSON.stringify({
          msg: "Server is up",
          instanceId: INSTANCE_ID,
          queueAcquired: callbacks.isQueueAcquired(),
        }),
      );
      return;
    } else if (req.method === "POST" && req.url === "/shutdown") {
      // Will be picked up by the `GracefulShutdown` instance
      process.kill(process.pid, "SIGTERM");
      res.writeHead(201);
      res.end("");
      return;
    }
    res.writeHead(404);
    res.end("");
  });

  return server;
};

const main = async () => {
  logger.info("STARTED");
  let queueAcquired = false;

  // Start a HTTP server
  const httpServer = createHttpServer({
    isQueueAcquired: () => queueAcquired,
  });
  httpServer.listen({ host: "::", port: PORT });
  logger.info(`HTTP server listening on port ${PORT}`);
  shutdown.addCleanup("HTTP server", async () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- the method is unbound and then bound
    await promisify(httpServer.close).bind(httpServer)();
  });

  // Connect to the database
  const pgConfig = {
    host: PG_HOST,
    user: PG_USER,
    password: PG_PASSWORD,
    database: PG_DATABASE,
    port: PG_PORT,
    maxPoolSize: 10, // @todo: needs tuning
  };

  /* eslint-disable @typescript-eslint/no-unsafe-call */

  const db = new PostgresAdapter(pgConfig, logger, statsd);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  shutdown.addCleanup("Postgres", () => db.close());

  // Connect to Redis
  const redis = new AsyncRedisClient(logger, {
    host: REDIS_HOST,
    port: REDIS_PORT,
  });
  shutdown.addCleanup("Redis", () => redis.close());

  const systemAccountId = await db.getSystemAccountId();

  /* eslint-enable @typescript-eslint/no-unsafe-call */

  // Connect to Opensearch
  const searchAuth =
    process.env.HASH_OPENSEARCH_USERNAME === undefined
      ? undefined
      : {
          username: process.env.HASH_OPENSEARCH_USERNAME,
          password: process.env.HASH_OPENSEARCH_PASSWORD ?? "",
        };
  const search = await OpenSearch.connect(logger, {
    host: OPENSEARCH_HOST,
    port: OPENSEARCH_PORT,
    auth: searchAuth,
    httpsEnabled: OPENSEARCH_HTTPS_ENABLED,
  });
  shutdown.addCleanup("OpenSearch", async () => search.close());

  // Create the `ENTITIES_INDEX` search index if it does not already exist.
  if (!(await search.indexExists({ index: ENTITIES_SEARCH_INDEX }))) {
    await search.createIndex({ index: ENTITIES_SEARCH_INDEX });
    logger.info(`Created search index "${ENTITIES_SEARCH_INDEX}"`);
  } else {
    logger.info(`Search index "${ENTITIES_SEARCH_INDEX}" already exists`);
  }

  // Acquire read ownership on the queue
  // Note: must `.release()` ownership before closing the Redis connection.
  const queueConsumer = new RedisQueueExclusiveConsumer(redis);
  logger.debug(`Acquiring read ownership on queue "${SEARCH_QUEUE_NAME}" ...`);

  while (!(await queueConsumer.acquire(SEARCH_QUEUE_NAME, 5_000))) {
    if (shutdown.isTriggered()) {
      break;
    }
    logger.silly(
      "Queue is owned by another consumer. Attempting to acquire ownership again ...",
    );
  }

  queueAcquired = true;
  logger.debug("Queue acquired");
  shutdown.addCleanup("queue ownership", async () => queueConsumer.release());

  // Periodically report queue size if StatsD is enabled
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  const int1 = setInterval(async () => {
    if (!statsd) {
      return;
    }
    const size = await queueConsumer.length(SEARCH_QUEUE_NAME);
    statsd.gauge("queue_size", size);
  }, 5_000);
  shutdown.addCleanup("statsd reporting", () => clearInterval(int1));

  // Initialize the SearchLoader
  const loader = new SearchLoader({
    db,
    search,
    queueConsumer,
    searchEntititesIndex: ENTITIES_SEARCH_INDEX,
    searchQueueName: SEARCH_QUEUE_NAME,
    systemAccountId,
    statsd,
  });
  shutdown.addCleanup("SearchLoader", async () => loader.stop());

  // Start reading messages from the queue and loading them into the search index
  await loader.start();
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
