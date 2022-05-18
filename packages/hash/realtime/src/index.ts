import * as crypto from "crypto";
import * as http from "http";

import { sql } from "slonik";
import {
  clearIntervalAsync,
  setIntervalAsync,
} from "set-interval-async/dynamic";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import {
  createPostgresConnPool,
  PgPool,
} from "@hashintel/hash-backend-utils/postgres";
import { Wal2JsonMsg } from "@hashintel/hash-backend-utils/wal2json";
import {
  getRequiredEnv,
  waitOnResource,
} from "@hashintel/hash-backend-utils/environment";

import { MONITOR_TABLES, generateQueues } from "./config";

// The name of the Postgres logical replication slot
const SLOT_NAME = "realtime";

// The number of milliseconds between queries to the replication slot
const POLL_INTERVAL_MILLIS = 150;

// An identifier for this instance of the realtime service. It is used to ensure
// only a single instance of the service is reading from the replication slot
// at a time.
const INSTANCE_ID = crypto.randomUUID();

// The number of milliseconds after which ownership of the replication slot expires.
// If an instance of this service fails to update its ownership within this
// time interval, another instance may acquire exclusive access to the slot.
// This expiry should be at least 2 * POLL_INTERVAL_SECONDS
const OWNERSHIP_EXPIRY_MILLIS = 10_000;

const logger = new Logger({
  mode: process.env.NODE_ENV === "development" ? "dev" : "prod",
  level: process.env.NODE_ENV === "development" ? "debug" : "info",
  serviceName: "realtime",
  metadata: { instanceId: INSTANCE_ID },
});

const QUEUES = generateQueues(logger);

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
  logger.debug(`Updated ownership of slot "${SLOT_NAME}"`);
};

/** Release ownership of the slot. Does nothing if this instance is not the current
 * owner. */
const releaseSlotOwnership = async (pool: PgPool) => {
  const res = await pool.query(sql`
    delete from realtime.ownership
    where slot_name = ${SLOT_NAME} and slot_owner = ${INSTANCE_ID}
  `);
  if (res.rowCount > 0) {
    logger.debug(`Released ownership of slot "${SLOT_NAME}"`);
  }
};

const pollChanges = async (pool: PgPool) => {
  // Note: setting 'include-transaction' to 'false' here removes the transaction begin
  // & end messages with action types "B" and "C", respectively. We don't need these.
  const rows = await pool.anyFirst(sql`
    select data::jsonb from pg_logical_slot_get_changes(
      ${SLOT_NAME},
      null,
      null,
      'add-tables', ${MONITOR_TABLES.join(",")},
      'format-version', '2',
      'include-transaction', 'false'
    )
  `);
  // Push each row change onto the queues
  for (const change of rows as any[]) {
    logger.debug({ message: "change", change });
    if (change.action === "T") {
      // Ignore TRUNCATE changes
      continue;
    }
    const changeStr = JSON.stringify(change as Wal2JsonMsg);
    await Promise.all(
      QUEUES.map(({ name, producer }) => producer.push(name, changeStr)),
    );
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
        }),
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
  const port = parseInt(process.env.HASH_REALTIME_PORT || "3333", 10);
  httpServer.listen({ host: "::", port });
  logger.info(`HTTP server listening on port ${port}`);

  const pgHost = getRequiredEnv("HASH_PG_HOST");
  const pgPort = parseInt(getRequiredEnv("HASH_PG_PORT"), 10);
  await waitOnResource(`tcp:${pgHost}:${pgPort}`, logger);

  const pool = createPostgresConnPool(logger, {
    user: getRequiredEnv("HASH_PG_USER"),
    host: pgHost,
    port: pgPort,
    database: getRequiredEnv("HASH_PG_DATABASE"),
    password: getRequiredEnv("HASH_PG_PASSWORD"),
    maxPoolSize: 1,
  });

  // Try to acquire the slot
  let slotAcquired = false;
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  const int1 = setInterval(async () => {
    slotAcquired = await acquireSlot(pool);
    if (slotAcquired) {
      clearInterval(int1);
      logger.debug("Acquired slot ownership");
      return;
    }
    logger.debug("Slot is owned. Waiting in standby.");
  }, OWNERSHIP_EXPIRY_MILLIS);

  // Poll the replication slot for new data
  // We are using set-interval-async/dynamic as the built-in setInterval might
  // call the callback in an overlapping manner if the promise takes longer
  // than the interval.
  //
  // set-interval-async/dynamic makes sure that no more than a single
  // instance of the callback promise is executed at any given time.
  // We can then also reduce the interval without fear that we will be stacking
  // DB queries unnecessarily.
  const int2 = setIntervalAsync(async () => {
    if (!slotAcquired) {
      return;
    }
    await Promise.all([pollChanges(pool), updateSlotOwnership(pool)]);
  }, POLL_INTERVAL_MILLIS);

  // Gracefully shutdown on receiving a termination signal.
  let receivedTerminationSignal = false;
  const shutdown = async (signal: string) => {
    logger.debug(`Received ${signal} signal`);
    if (receivedTerminationSignal) {
      return;
    }
    receivedTerminationSignal = true;
    await clearIntervalAsync(int2);

    // Ownership will expire, but release anyway
    await releaseSlotOwnership(pool);

    logger.debug("Closing connection pool");
    await pool.end();

    httpServer.close((_) => {
      logger.debug("SHUTDOWN");
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
};

(async () => {
  await main();
})().catch(logger.error);
