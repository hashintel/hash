import * as http from "http";
import { promisify } from "util";
import { sleep } from "@hashintel/hash-shared/sleep";

import { TextToken } from "@hashintel/hash-shared/graphql/types";
import { AsyncRedisClient } from "@hashintel/hash-backend-utils/redis";
import { QueueExclusiveConsumer } from "@hashintel/hash-backend-utils/queue/adapter";
import { RedisQueueExclusiveConsumer } from "@hashintel/hash-backend-utils/queue/redis";
import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { GracefulShutdown } from "@hashintel/hash-backend-utils/shutdown";
import { Wal2JsonMsg } from "@hashintel/hash-backend-utils/wal2json";
import { EntityVersion } from "@hashintel/hash-backend-utils/pgTables";
import {
  createPostgresConnPool,
  PgPool,
} from "@hashintel/hash-backend-utils/postgres";
import { SearchAdapter } from "@hashintel/hash-backend-utils/search/adapter";
import { OpenSearch } from "@hashintel/hash-backend-utils/search/opensearch";
import { EntitiesDocument } from "@hashintel/hash-backend-utils/search/doc-types";
import { StatsD } from "hot-shots";

import { getSystemAccountId, getEntityType } from "./db";
import { logger, INSTANCE_ID } from "./config";

const OPENSEARCH_ENABLED = process.env.HASH_OPENSEARCH_ENABLED === "true";
if (!OPENSEARCH_ENABLED) {
  // eslint-disable-next-line no-console
  console.log("Opensearch is not enabled. Shutting down search-loader");
  process.exit(0);
}

// Environment variables
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

// The accountId of the system (set below in `main`)
let SYSTEM_ACCOUNT_ID: string;

// The name of the search index for entities.
const ENTITIES_INDEX = "entities";

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

/** Convert a Text entities properties to a string which may be indexed for the
 * purposes of full-text-search.
 * @todo: This is a temporary solution. The conversion should be handled at the level of
 * the entity of the type are created?
 *
 * Example:
 *   {"tokens": [{"type": "text", "text": "Hello World!", "underline": true}, {"type": "text", "text": "Welcome to HASH!"}]}
 *
 * Returns:
 *  "Hello World! Welcome to HASH!"
 */
const textEntityPropertiesToFTS = (properties: any): string => {
  return properties.tokens
    .map((token: TextToken) => {
      switch (token.tokenType) {
        case "text":
          return token.text;
        case "hardBreak":
          return "\n";
        default:
          return " ";
      }
    })
    .join(" ");
};

class SearchLoader {
  private stopRequested = false;
  private isStopped = false;

  /** The `SearchLoader` is responsible for consuming items from the redis queue
   * and loading the data into the search service. */
  constructor(
    private queue: QueueExclusiveConsumer,
    private search: SearchAdapter,
    // @todo(eadan): change this to be a generic database adapter
    private pool: PgPool,
  ) {}

  /** Start the loader process which reads messages from the ingestion queue and
   * loads each into the search service.
   */
  async start(): Promise<void> {
    logger.debug("Search loader started");
    this.stopRequested = false;
    this.isStopped = false;
    while (!this.stopRequested) {
      await this.processNextQueueMsg(1000);
    }
    this.isStopped = true;
  }

  /** Process the next item on the queue, or return early if the queue is empty for
   * longer than `timeout` milliseconds. */
  private async processNextQueueMsg(timeout: number): Promise<void> {
    const processed = await this.queue.pop(
      SEARCH_QUEUE_NAME,
      timeout,
      async (item: string) => {
        const wal2jsonMsg = JSON.parse(item) as Wal2JsonMsg;
        await this.loadMsgIntoSearchIndex(wal2jsonMsg);
        logger.debug(item);
        return true;
      },
    );
    if (processed) {
      statsd?.increment("messages_processed");
    }
  }

  /** Load a message into the search index. */
  private async loadMsgIntoSearchIndex(wal2jsonMsg: Wal2JsonMsg) {
    const table = wal2jsonMsg.table;
    if (table === "entity_versions") {
      const entity = EntityVersion.parseWal2JsonMsg(wal2jsonMsg);
      const entityType = await getEntityType(this.pool, {
        entityTypeVersionId: entity.entityTypeVersionId,
      });
      const indexedEntity: EntitiesDocument = {
        accountId: entity.accountId,
        entityId: entity.entityId,
        entityVersionId: entity.entityVersionId,
        entityTypeId: entityType.entityTypeId,
        entityTypeVersionId: entity.entityTypeVersionId,
        entityTypeName: entityType.name,
        updatedAt: entity.updatedAt.toISOString(),
        updatedByAccountId: entity.updatedByAccountId,
      };
      // @todo: could move the `SYSTEM_TYPES` definition from the backend to backend-utils
      // and use it here rather than checking the string value of the entity type name.
      if (
        entityType.accountId === SYSTEM_ACCOUNT_ID &&
        entityType.name === "Text"
      ) {
        indexedEntity.fullTextSearch = textEntityPropertiesToFTS(
          entity.properties,
        );
      } else if (
        entityType.accountId === SYSTEM_ACCOUNT_ID &&
        entityType.name === "Page"
      ) {
        indexedEntity.fullTextSearch = entity.properties.title;
      } else {
        // @todo: we're only considering Text and Page entities for full text search at
        // the moment. Return here when we figure out how to deal with text search on
        // arbitrary entities. For now, just do FTS on the JSON.stringified properties
      }

      await this.search.index({
        index: ENTITIES_INDEX,
        id: indexedEntity.entityVersionId,
        body: indexedEntity,
      });
    } else {
      throw new Error(`unexpected change message from table "${table}"`);
    }
  }

  /** Stop the loader process gracefully. */
  async stop() {
    this.stopRequested = true;
    for (let i = 0; i < 10; i++) {
      if (this.isStopped) {
        return;
      }
      await sleep(1000);
    }
    throw new Error("could not stop `SearchLoader` instance.");
  }
}

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
    await promisify(httpServer.close).bind(httpServer)();
  });

  // Connect to the database
  const pg = createPostgresConnPool(logger, {
    host: PG_HOST,
    port: PG_PORT,
    user: PG_USER,
    password: PG_PASSWORD,
    database: PG_DATABASE,
    maxPoolSize: 10, // @todo: optimize for production
  });
  shutdown.addCleanup("Postgres pool", async () => pg.end());

  // Connect to Redis
  const redis = new AsyncRedisClient(logger, {
    host: REDIS_HOST,
    port: REDIS_PORT,
  });
  shutdown.addCleanup("Redis", async () => redis.close());

  SYSTEM_ACCOUNT_ID = await getSystemAccountId(pg);

  // Connect to Opensearch
  const searchAuth =
    process.env.HASH_OPENSEARCH_USERNAME === undefined
      ? undefined
      : {
          username: process.env.HASH_OPENSEARCH_USERNAME,
          password: process.env.HASH_OPENSEARCH_PASSWORD || "",
        };
  const search = await OpenSearch.connect(logger, {
    host: OPENSEARCH_HOST,
    port: OPENSEARCH_PORT,
    auth: searchAuth,
    httpsEnabled: OPENSEARCH_HTTPS_ENABLED,
  });
  shutdown.addCleanup("OpenSearch", async () => search.close());

  // Create the `ENTITIES_INDEX` search index if it does not already exist.
  if (!(await search.indexExists({ index: ENTITIES_INDEX }))) {
    await search.createIndex({ index: ENTITIES_INDEX });
    logger.info(`Created search index "${ENTITIES_INDEX}"`);
  } else {
    logger.info(`Search index "${ENTITIES_INDEX}" already exists`);
  }

  // Acquire read ownership on the queue
  // Note: must `.release()` ownership before closing the Redis connection.
  const queue = new RedisQueueExclusiveConsumer(redis);
  logger.debug(`Acquiring read ownership on queue "${SEARCH_QUEUE_NAME}" ...`);

  while (!(await queue.acquire(SEARCH_QUEUE_NAME, 5_000))) {
    if (shutdown.isTriggered()) {
      break;
    }
    logger.debug(
      "Queue is owned by another consumer. Attempting to acquire ownership again ...",
    );
  }

  queueAcquired = true;
  logger.debug("Queue acquired");
  shutdown.addCleanup("queue ownership", async () => queue.release());

  // Periodically report queue size if StatsD is enabled
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  const int1 = setInterval(async () => {
    if (!statsd) {
      return;
    }
    const size = await queue.length(SEARCH_QUEUE_NAME);
    statsd?.gauge("queue_size", size);
  }, 5_000);
  shutdown.addCleanup("statsd reporting", async () => clearInterval(int1));

  // Initialize the SearchLoader
  const loader = new SearchLoader(queue, search, pg);
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
