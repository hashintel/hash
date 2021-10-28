import * as crypto from "crypto";
import * as http from "http";

import { sql } from "slonik";

import { Logger } from "@hashintel/hash-backend-utils/logger";
import { RedisQueueProducer } from "@hashintel/hash-backend-utils/queue/redis";
import { AsyncRedisClient } from "@hashintel/hash-backend-utils/redis";
import {
  createPostgresConnPool,
  ConnPool,
} from "@hashintel/hash-backend-utils/postgres";
import { getRequiredEnv } from "./util";

// The name of the Postgres logical replication slot
const SLOT_NAME = "realtime";

// The number of milliseconds between queries to the replication slot
const POLL_INTERVAL_MILLIS = 5_000;

// An identifier for this instance of the realtime service. It is used to ensure
// only a single instance of the service is reading from the replication slot
// at a time.
const INSTANCE_ID = crypto.randomUUID();

// The number of milliseconds after which ownership of the replication slot expires.
// If an instance of this service fails to update its ownership within this
// time interval, another instance may acquire exclusive access to the slot.
// This expiry should be at least 2 * POLL_INTERVAL_SECONDS
const OWNERSHIP_EXPIRY_MILLIS = 10_000;

// The tables to monitor for changes
const MONITOR_TABLES = ["public.entities", "public.entity_types"].join(",");

const logger = new Logger({
  mode: process.env.NODE_ENV === "development" ? "dev" : "prod",
  level: process.env.NODE_ENV === "development" ? "debug" : "info",
  serviceName: "realtime",
  metadata: { instanceId: INSTANCE_ID },
});

// The realtime service will push all updates from the Postgres changestream to the
// following queues.
const QUEUES = [
  {
    name: getRequiredEnv("HASH_SEARCH_QUEUE_NAME"),
    producer: new RedisQueueProducer(
      new AsyncRedisClient({
        host: getRequiredEnv("HASH_REDIS_HOST"),
        port: parseInt(getRequiredEnv("HASH_REDIS_PORT"), 10),
      })
    ),
  },
];

const acquireSlot = async (pool: ConnPool) => {
const acquireSlot = async (pool: PgPool) => {
  // Create the slot if it does not exist
  const slotExists = await pool.exists(sql`
    select * from pg_replication_slots where slot_name = ${SLOT_NAME}
  `);
  if (!slotExists) {
    await pool.query(sql`
      select * from pg_create_logical_replication_slot(${SLOT_NAME}, 'wal2json')
    `);
    logger.info(`Created replication slot '${SLOT_NAME}'`);
  }

  // Attempt to take ownership of the slot
  const slotAcquired = await pool.transaction(async (tx) => {
    const slotIsOwned = await tx.maybeOneFirst(sql`
      select ownership_expires_at > now() as owned from realtime.ownership
      where slot_name = ${SLOT_NAME}
      for update
    `);
    if (!slotIsOwned) {
      const expires = sql`now() + ${
        OWNERSHIP_EXPIRY_MILLIS / 1000
      } * interval '1 second'`;
      await tx.query(sql`
        insert into realtime.ownership (slot_name, slot_owner, ownership_expires_at)
        values (${SLOT_NAME}, ${INSTANCE_ID}, ${expires})
        on conflict (slot_name) do update
        set
          slot_owner = EXCLUDED.slot_owner,
          ownership_expires_at = EXCLUDED.ownership_expires_at
      `);
      return true;
    }
    // The slot is owned by another instance of the realtime service
    return false;
  });

  return slotAcquired;
};

/** Update this instance's ownership of the slot. */
const updateSlotOwnership = async (pool: PgPool) => {
  await pool.query(sql`
    update realtime.ownership
    set
      ownership_expires_at = now() + ${
        OWNERSHIP_EXPIRY_MILLIS / 1000
      } * interval '1 second'
    where slot_name = ${SLOT_NAME} and slot_owner = ${INSTANCE_ID}
  `);
  logger.info(`Updated ownership of slot "${SLOT_NAME}"`);
};

/** Release ownership of the slot. Does nothing if this instance is not the current
 * owner. */
const releaseSlotOwnership = async (pool: PgPool) => {
  const res = await pool.query(sql`
    delete from realtime.ownership
    where slot_name = ${SLOT_NAME} and slot_owner = ${INSTANCE_ID}
  `);
  if (res.rowCount > 0) {
    logger.info(`Released ownership of slot "${SLOT_NAME}"`);
  }
};

const pollChanges = async (pool: PgPool) => {
  const rows = await pool.anyFirst(sql`
    select data::jsonb from pg_logical_slot_get_changes(${SLOT_NAME}, null, null, 'add-tables', ${MONITOR_TABLES})
  `);
  for (const row of rows) {
    for (const change of (row as any).change) {
      // Push the changes onto the queues
      logger.debug({ message: "change", change });
      for (const { name, producer } of QUEUES) {
        await producer.push(name, JSON.stringify(change));
      }
    }
  }
};

const createHttpServer = () => {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health-check") {
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(
        JSON.stringify({
          msg: "realtime server healthy",
        })
      );
      return;
    }
    res.writeHead(404);
    res.end("");
  });

  server.on("error", (err) => logger.error(err));
  server.on("close", () => logger.info("HTTP server closed"));

  return server;
};

const main = async () => {
  logger.info("STARTED");

  // Start a HTTP server
  const httpServer = createHttpServer();
  const port = parseInt(process.env.HASH_REALTIME_PORT || "0", 10) || 3333;
  httpServer.listen({ host: "::", port });
  logger.info(`HTTP server listening on port ${port}`);

  const pool = createPostgresConnPool(logger, {
    user: getRequiredEnv("HASH_PG_USER", "postgres"),
    host: getRequiredEnv("HASH_PG_HOST", "localhost"),
    port: parseInt(getRequiredEnv("HASH_PG_PORT", "5432"), 10),
    database: getRequiredEnv("HASH_PG_DATABASE", "postgres"),
    password: getRequiredEnv("HASH_PG_PASSWORD", "postgres"),
    maxPoolSize: 1,
  });

  // Try to acquire the slot
  let slotAcquired = false;
  const int1 = setInterval(async () => {
    slotAcquired = await acquireSlot(pool);
    if (slotAcquired) {
      clearInterval(int1);
      logger.info("Acquired slot ownership");
      return;
    }
    logger.info("Slot is owned. Waiting in standby.");
  }, OWNERSHIP_EXPIRY_MILLIS);

  // Poll the replication slot for new data
  const int2 = setInterval(async () => {
    if (!slotAcquired) {
      return;
    }
    await Promise.all([pollChanges(pool), updateSlotOwnership(pool)]);
  }, POLL_INTERVAL_MILLIS);

  // Gracefully shutdown on receiving a termination signal.
  let receivedTerminationSignal = false;
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal} signal`);
    if (receivedTerminationSignal) {
      return;
    }
    receivedTerminationSignal = true;
    clearInterval(int2);

    // Ownership will expire, but release anyway
    await releaseSlotOwnership(pool);

    logger.info("Closing connection pool");
    await pool.end();

    httpServer.close((_) => {
      logger.info("SHUTDOWN");
      process.exit(0);
    });
  };
  process.on("SIGTERM", async () => await shutdown("SIGTERM"));
  process.on("SIGINT", async () => await shutdown("SIGINT"));
};

(async () => {
  await main();
})().catch(logger.error);
