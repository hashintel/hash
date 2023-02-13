/* eslint-disable canonical/filename-no-index -- @todo rename file */

import * as crypto from "node:crypto";
import * as http from "node:http";

import {
  getRequiredEnv,
  waitOnResource,
} from "@local/hash-backend-utils/environment";
import { Logger } from "@local/hash-backend-utils/logger";
import {
  createPostgresConnPool,
  PgPool,
} from "@local/hash-backend-utils/postgres";
import { GracefulShutdown } from "@local/hash-backend-utils/shutdown";
import {
  clearIntervalAsync,
  setIntervalAsync,
} from "set-interval-async/dynamic";
import { sql } from "slonik";

import { generateQueues, MONITOR_TABLES } from "./config";

// The number of milliseconds between queries to the replication slot
const POLL_INTERVAL_MILLIS = 250;

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

const shutdown = new GracefulShutdown(logger, "SIGINT", "SIGTERM");

const acquireReplicationSlot = async (
  pool: PgPool,
  slotName: string,
  options: { temporary?: boolean },
) => {
  // Create the slot if it does not exist. This allows for permanent or temporary slots.
  // Setup borrowed from:
  // https://github.com/supabase/realtime/blob/5dcf96b3629aa98ba55cc212aea8bb1fbeedf4af/server/lib/realtime/rls/replications.ex#L4-L18k
  await pool.query(sql`
  select
        case
          when not exists (
            select 1
            from pg_replication_slots
            where slot_name = ${slotName}
          )
          then (
            -- Second argument to this calls specifies whether or not the replication
            -- slot is temporary.
            select 1 from pg_create_logical_replication_slot(${slotName}, 'wal2json', ${
    options.temporary ?? true
  })
          )
          else 1
        end;`);

  const slotExists = await pool.exists(sql`
    select * from pg_replication_slots where slot_name = ${slotName}
  `);

  if (slotExists) {
    logger.info(`Replication slot '${slotName}' exists.`);
  } else {
    logger.warn(`Could not create replication slot '${slotName}'. Retrying..`);
    return false;
  }

  // Attempt to take ownership of the slot
  return await pool.transaction(async (tx) => {
    /**
     * @todo the 'for update' clause only works for single-shard queries in citus
     *   make sure that this use case falls under that category.
     *   See: https://docs.citusdata.com/en/stable/develop/reference_workarounds.html#sql-support-and-workarounds
     *   Task: https://app.asana.com/0/0/1203010655090001/f
     */
    const slotIsOwned = await tx.maybeOneFirst(sql`
      select ownership_expires_at > now() as owned from realtime.ownership
      where slot_name = ${slotName}
      for update
    `);
    if (!slotIsOwned) {
      const expires = sql`now() + ${
        OWNERSHIP_EXPIRY_MILLIS / 1000
      } * interval '1 second'`;
      await tx.query(sql`
        insert into realtime.ownership (slot_name, slot_owner, ownership_expires_at)
        values (${slotName}, ${INSTANCE_ID}, ${expires})
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
};

/** Update this instance's ownership of the slot. */
const updateSlotOwnership = async (pool: PgPool, slotName: string) => {
  await pool.query(sql`
    update realtime.ownership
    set
      ownership_expires_at = now() + ${
        OWNERSHIP_EXPIRY_MILLIS / 1000
      } * interval '1 second'
    where slot_name = ${slotName} and slot_owner = ${INSTANCE_ID}
  `);
  logger.debug(`Updated ownership of slot "${slotName}"`);
};

/** Release ownership of the slot. Does nothing if this instance is not the current
 * owner. */
const releaseSlotOwnership = async (pool: PgPool, slotName: string) => {
  const res = await pool.query(sql`
    delete from realtime.ownership
    where slot_name = ${slotName} and slot_owner = ${INSTANCE_ID}
  `);
  if (res.rowCount > 0) {
    logger.debug(`Released ownership of slot "${slotName}"`);
  }
};

const pollChanges = async (pool: PgPool, slotName: string) => {
  // Note: setting 'include-transaction' to 'false' here removes the transaction begin
  // & end messages with action types "B" and "C", respectively. We don't need these.
  const rows = await pool.anyFirst(sql`
    select data::jsonb from pg_logical_slot_get_changes(
      ${slotName},
      null,
      null,
      'add-tables', ${MONITOR_TABLES.join(",")},
      'format-version', '2',
      'include-transaction', 'false'
    )
  `);
  // Push each row change onto the queues
  for (const change of rows) {
    logger.debug({ message: "change", change });
    // @ts-expect-error -- Ignore TRUNCATE changes (absent in types), see Wal2JsonMsg
    if (change?.action === "T") {
      continue;
    }
    const changeStr = JSON.stringify(change);
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

  // The name of the Postgres logical replication slot
  const slotName = process.env.HASH_REALTIME_SLOT_NAME ?? "realtime";

  // Start a HTTP server
  const httpServer = createHttpServer();
  const port = parseInt(process.env.HASH_REALTIME_PORT ?? "", 10) || 3333;
  httpServer.listen({ host: "::", port });
  logger.info(`HTTP server listening on port ${port}`);
  shutdown.addCleanup("HTTP server", async () => {
    return new Promise((resolve, _reject) => {
      httpServer.close((_) => {
        logger.debug("SHUTDOWN");
        resolve();
      });
    });
  });

  const pgHost = process.env.HASH_GRAPH_PG_HOST ?? "localhost";
  const pgPort = parseInt(process.env.HASH_GRAPH_PG_PORT ?? "5432", 10);
  await waitOnResource(`tcp:${pgHost}:${pgPort}`, logger);

  const pool = createPostgresConnPool(logger, {
    user: getRequiredEnv("HASH_GRAPH_REALTIME_PG_USER"),
    host: pgHost,
    port: pgPort,
    /**
     * @todo: update how the database is set once realtime if realtime is run in the testing environment.
     *   See https://app.asana.com/0/0/1203046447168483/f
     */
    database: getRequiredEnv("HASH_GRAPH_PG_DEV_DATABASE"),
    password: getRequiredEnv("HASH_GRAPH_REALTIME_PG_PASSWORD"),
    maxPoolSize: 1,
  });

  shutdown.addCleanup("Postgres connection", async () => {
    // Ownership will expire, but release anyway
    await releaseSlotOwnership(pool, slotName);

    logger.debug("Closing connection pool");
    await pool.end();
  });

  // The replication is set to be temporary because it prevents writing to disk.
  // If we write the WAL to disk, our DB might halt because of running out of space.
  // Instead, temporary slots will only store the WAL in memory, and flush when changes are polled.
  //
  // First call outside the interval to run it immediately.
  let slotAcquired = await acquireReplicationSlot(pool, slotName, {
    temporary: true,
  });

  // Retry loop to acquire replication slot.
  const slotInterval = setIntervalAsync(async () => {
    if (slotAcquired) {
      // The following is a work-around to not deadlock clearing the interval:
      // https://github.com/ealmansi/set-interval-async/tree/b05a0406a247ab8ad390db5d45d7d7b0a6ee6eff#avoiding-deadlock-when-clearing-an-interval
      void (async () => {
        await clearIntervalAsync(slotInterval);
        logger.info("Acquired slot ownership");
      })();
      return;
    }

    slotAcquired = await acquireReplicationSlot(pool, slotName, {
      temporary: true,
    });
    logger.debug("Slot is owned. Waiting in standby.");
  }, OWNERSHIP_EXPIRY_MILLIS);

  shutdown.addCleanup("Postgres connection", async () => {
    await clearIntervalAsync(slotInterval);
  });

  // Poll the replication slot for new data
  // We are using set-interval-async/dynamic as the built-in setInterval might
  // call the callback in an overlapping manner if the promise takes longer
  // than the interval.
  //
  // set-interval-async/dynamic makes sure that no more than a single
  // instance of the callback promise is executed at any given time.
  // We can then also reduce the interval without fear that we will be stacking
  // DB queries unnecessarily.
  const pollInterval = setIntervalAsync(async () => {
    if (!slotAcquired) {
      return;
    }
    try {
      await Promise.all([
        pollChanges(pool, slotName),
        updateSlotOwnership(pool, slotName),
      ]);
    } catch (error) {
      logger.error(
        "An error occoured while polling/updating replication owner.",
        error,
      );
    }
  }, POLL_INTERVAL_MILLIS);

  shutdown.addCleanup("Postgres connection", async () => {
    await clearIntervalAsync(pollInterval);
  });
};

(async () => {
  await main();
})().catch(async (err) => {
  logger.error(err);
  await shutdown.trigger();
});
