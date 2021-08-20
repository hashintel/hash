import * as crypto from "crypto";

import { sql } from "slonik";
import { Logger } from "winston";

import {
  getRequiredEnv,
  createPostgresConnPool,
  createLogger,
  ConnPool,
} from "./util";

// The name of the Postgres logical replication slot
const SLOT_NAME = "realtime";

// The number of seconds between queries to the replication slot
const POLL_INTERVAL_SECONDS = 5;

// An identifier for this instance of the realtime service. It is used to ensure
// only a single instance of the service is reading from the replication slot
// at a time.
const INSTANCE_ID = crypto.randomUUID();

// The number of seconds after which ownership of the replication slot expires.
// If an instance of this service fails to update its ownership within this
// time interval, another instance may acquire exclusive access to the slot.
// This expiry should be at least 2 * POLL_INTERVAL_SECONDS
const OWNERSHIP_EXPIRY_SECONDS = 10;

// The tables to monitor for changes
const MONITOR_TABLES = ["public.entities", "public.entity_types"].join(",");

const acquireSlot = async (logger: Logger, pool: ConnPool) => {
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
  const slotAcquired = pool.transaction(async (tx) => {
    const slotIsOwned = await tx.maybeOneFirst(sql`
      select ownership_expires_at > now() as owned from realtime.ownership
      where slot_name = ${SLOT_NAME}
      for update
    `);
    if (!slotIsOwned) {
      const expires = sql`now() + ${OWNERSHIP_EXPIRY_SECONDS} * interval '1 second'`;
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
    return false;
  });

  return slotAcquired;
};

/** Update this instance's ownership of the slot. */
const updateSlotOwnership = async (logger: Logger, pool: ConnPool) => {
  await pool.query(sql`
    update realtime.ownership
    set
      ownership_expires_at = now() + ${OWNERSHIP_EXPIRY_SECONDS} * interval '1 second'
    where slot_name = ${SLOT_NAME} and slot_owner = ${INSTANCE_ID}
  `);
  logger.info("Updated slot ownership");
};

/** Release ownership of the slot. Does nothing if this instance is not the current
 * owner. */
const releaseSlotOwnership = async (logger: Logger, pool: ConnPool) => {
  const res = await pool.query(sql`
    delete from realtime.ownership
    where slot_name = ${SLOT_NAME} and slot_owner = ${INSTANCE_ID}
  `);
  if (res.rowCount > 0) {
    logger.info("Released slot ownership");
  }
};

const pollChanges = async (logger: Logger, pool: ConnPool) => {
  const rows = await pool.anyFirst(sql`
    select data::jsonb from pg_logical_slot_get_changes(${SLOT_NAME}, null, null, 'add-tables', ${MONITOR_TABLES})
  `);
  for (const row of rows) {
    for (const change of (row as any)["change"]) {
      // @todo: do something with the change
      logger.info({ message: "change", change });
    }
  }
};

const main = async () => {
  const logger = createLogger("realtime");
  logger.defaultMeta = {
    ...(logger.defaultMeta ?? {}),
    instanceId: INSTANCE_ID,
  };
  logger.info("STARTED");

  const pool = createPostgresConnPool(logger, {
    user: getRequiredEnv("HASH_PG_USER", "postgres"),
    host: getRequiredEnv("HASH_PG_HOST", "localhost"),
    port: parseInt(getRequiredEnv("HASH_PG_PORT", "5432")),
    database: getRequiredEnv("HASH_PG_DATABASE", "postgres"),
    password: getRequiredEnv("HASH_PG_PASSWORD", "postgres"),
    maxPoolSize: 1,
  });

  // Try to acquire the slot
  let slotAcquired = false;
  const int1 = setInterval(async () => {
    slotAcquired = await acquireSlot(logger, pool);
    if (slotAcquired) {
      clearInterval(int1);
      logger.info("Acquired slot ownership");
      return;
    }
    logger.info("Slot is owned. Waiting in standby.");
  }, OWNERSHIP_EXPIRY_SECONDS * 1000);

  // Poll the replication slot for new data
  const int2 = setInterval(async () => {
    if (!slotAcquired) {
      return;
    }
    await Promise.all([
      pollChanges(logger, pool),
      updateSlotOwnership(logger, pool),
    ]);
  }, POLL_INTERVAL_SECONDS * 1000);

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
    await releaseSlotOwnership(logger, pool);

    logger.info("Closing connection pool");
    await pool.end();

    logger.info("SHUTDOWN");
    process.exit(0);
  };
  process.on("SIGTERM", async () => await shutdown("SIGTERM"));
  process.on("SIGINT", async () => await shutdown("SIGINT"));
};

(async () => {
  await main();
})().catch((err) => console.error(err));
