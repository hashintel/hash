/**
 * `PostgresStorage` retrying its own transient failures, on the compose
 * Postgres. Pi Durable fails the Session on any error a Storage method
 * throws, so the storage retries what it can prove is safe to run again:
 * every read, and a commit whose failure came before `COMMIT` was sent.
 */
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";

import {
  BACKGROUND_CONTEXT,
  withAbortSignal,
} from "@earendil-works/chord/context";
import { type ConversationId } from "@earendil-works/pi-durable";
import { Client, Pool, type PoolClient } from "pg";
import { afterAll, expect, test } from "vitest";

import { postgresConfigFromEnvironment } from "../../src/storage/postgres/postgres-config";
import {
  openPostgresStorage,
  type PostgresStorage,
} from "../../src/storage/postgres/postgres-storage";

const context = BACKGROUND_CONTEXT;
const poolConfig = postgresConfigFromEnvironment();
const admin = new Pool({ ...poolConfig, max: 1 });
afterAll(() => admin.end());

/** Long enough for a new connection to the compose Postgres. */
const waitMs = 200;

const freshSchema = () => `pi_durable_test_${randomUUID().replaceAll("-", "")}`;

/**
 * A one-connection pool that records the statements its clients run. Each
 * `afterStatement` runs once the statement succeeded, so throwing from it
 * fails a statement the database did run. The pool waits `poolWaitMs` for a
 * connection, `waitMs` when absent.
 */
const observedPool = (
  afterStatement: (text: string) => void = () => {},
  { poolWaitMs = waitMs }: { poolWaitMs?: number } = {},
): { pool: Pool; statements: string[] } => {
  const pool = new Pool({
    ...poolConfig,
    max: 1,
    connectionTimeoutMillis: poolWaitMs,
  });
  // A terminated idle client's error removes it from the pool.
  pool.on("error", () => {});
  const statements: string[] = [];
  const patched = new WeakSet<PoolClient>();
  const connect = pool.connect.bind(pool);
  pool.connect = (async (...args: unknown[]) => {
    // `pool.query` checks out its client by callback; leave that path alone.
    if (args.length > 0) return (connect as (...a: unknown[]) => void)(...args);
    const client = await connect();
    if (!patched.has(client)) {
      patched.add(client);
      const query = client.query.bind(client) as (
        ...a: unknown[]
      ) => Promise<unknown>;
      client.query = (async (...queryArgs: unknown[]) => {
        const [first] = queryArgs;
        const text =
          typeof first === "string" ? first : (first as { text: string }).text;
        statements.push(text);
        const result = await query(...queryArgs);
        afterStatement(text);
        return result;
      }) as PoolClient["query"];
    }
    return client;
  }) as Pool["connect"];
  return { pool, statements };
};

const commitConversation = async (storage: PostgresStorage) => {
  const id = await storage.mintId<ConversationId>();
  await storage.commit(
    [[{ type: "conversation", value: { id } }]],
    () => {},
    context,
  );
  return id;
};

/** Hold the pool's only connection for `holdMs`. */
const holdConnection = async (pool: Pool, holdMs: number) => {
  const held = await pool.connect();
  void sleep(holdMs).then(() => held.release());
};

const withStorage = async (
  pool: Pool,
  run: (storage: PostgresStorage, schema: string) => Promise<void>,
  options: { transientRetryMs?: number } = {},
) => {
  const schema = freshSchema();
  const storage = await openPostgresStorage({ pool, schema, ...options });
  try {
    await run(storage, schema);
  } finally {
    await storage.close(context);
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
};

const storedConversations = async (schema: string) =>
  Number(
    (
      await admin.query<{ count: string }>(
        `SELECT count(*) AS count FROM "${schema}".conversations`,
      )
    ).rows[0]?.count,
  );

test("a read that gets no pool connection in time is retried and succeeds", async () => {
  const { pool } = observedPool();
  await withStorage(pool, async (storage) => {
    const id = await commitConversation(storage);
    await holdConnection(pool, waitMs + 150);
    expect(await storage.conversation(id, context)).toEqual({ id });
  });
});

test("a commit that gets no pool connection in time is retried and stored once", async () => {
  const { pool, statements } = observedPool();
  await withStorage(pool, async (storage, schema) => {
    await holdConnection(pool, waitMs + 150);
    const id = await commitConversation(storage);
    expect(await storage.conversation(id, context)).toEqual({ id });
    expect(await storedConversations(schema)).toBe(1);
    expect(statements.filter((text) => text === "COMMIT")).toHaveLength(2);
  });
});

/** A pool wait longer than the retry window, as in production. */
const longPoolWait = { poolWaitMs: 1500, transientRetryMs: 1000 };

test("a read whose first pool wait outlasts the retry window is still retried and succeeds", async () => {
  const { poolWaitMs, transientRetryMs } = longPoolWait;
  const { pool } = observedPool(undefined, { poolWaitMs });
  await withStorage(
    pool,
    async (storage) => {
      const id = await commitConversation(storage);
      await holdConnection(pool, poolWaitMs + 300);
      expect(await storage.conversation(id, context)).toEqual({ id });
    },
    { transientRetryMs },
  );
});

test("a commit whose first pool wait outlasts the retry window is still retried and stored once", async () => {
  const { poolWaitMs, transientRetryMs } = longPoolWait;
  const { pool, statements } = observedPool(undefined, { poolWaitMs });
  await withStorage(
    pool,
    async (storage, schema) => {
      await holdConnection(pool, poolWaitMs + 300);
      const id = await commitConversation(storage);
      expect(await storage.conversation(id, context)).toEqual({ id });
      expect(await storedConversations(schema)).toBe(1);
      expect(statements.filter((text) => text === "COMMIT")).toHaveLength(2);
    },
    { transientRetryMs },
  );
});

test("a commit whose connection is lost before COMMIT is retried and stored once", async () => {
  const { pool, statements } = observedPool();
  await withStorage(pool, async (storage, schema) => {
    // Hold the metadata row lock, so the commit waits inside its transaction.
    const locker = new Client(poolConfig);
    await locker.connect();
    try {
      await locker.query("BEGIN");
      await locker.query(
        `SELECT 1 FROM "${schema}".durable_metadata WHERE singleton = 1 FOR UPDATE`,
      );
      const committed = commitConversation(storage);
      let terminated = false;
      for (let attempt = 0; attempt < 100 && !terminated; attempt++) {
        // eslint-disable-next-line no-await-in-loop -- Polls until the commit waits on the lock.
        const { rows } = await admin.query<{ terminated: boolean }>(
          `SELECT pg_terminate_backend(pid) AS terminated FROM pg_stat_activity
            WHERE wait_event_type = 'Lock' AND query LIKE $1 AND pid <> pg_backend_pid()`,
          [`%"${schema}".durable_metadata%FOR UPDATE%`],
        );
        terminated = rows[0]?.terminated === true;
        // eslint-disable-next-line no-await-in-loop
        if (!terminated) await sleep(20);
      }
      expect(terminated).toBe(true);
      await locker.query("COMMIT");
      const id = await committed;
      expect(await storage.conversation(id, context)).toEqual({ id });
      expect(await storedConversations(schema)).toBe(1);
      expect(statements.filter((text) => text === "BEGIN")).toHaveLength(3);
    } finally {
      await locker.end();
    }
  });
});

test("a commit whose COMMIT fails is not retried: its outcome is unknown", async () => {
  let failCommit = false;
  const { pool, statements } = observedPool((text) => {
    if (failCommit && text === "COMMIT") {
      failCommit = false;
      throw new Error("Connection terminated unexpectedly");
    }
  });
  await withStorage(pool, async (storage, schema) => {
    failCommit = true;
    await expect(commitConversation(storage)).rejects.toThrow(
      "Connection terminated unexpectedly",
    );
    // `COMMIT` ran: the batch is stored, and running it again would be refused or stored twice.
    expect(statements.filter((text) => text === "COMMIT")).toHaveLength(2);
    expect(await storedConversations(schema)).toBe(1);
  });
});

test("a commit by a storage that lost ownership is not retried", async () => {
  const { pool, statements } = observedPool();
  await withStorage(pool, async (storage, schema) => {
    const successor = await openPostgresStorage({ pool: poolConfig, schema });
    try {
      const before = statements.length;
      await expect(commitConversation(storage)).rejects.toThrow(
        "is owned by a storage opened later",
      );
      expect(
        statements.slice(before).filter((text) => text === "BEGIN"),
      ).toHaveLength(1);
    } finally {
      await successor.close(context);
    }
  });
});

test("a read gives up once the retry window has passed, with the pool's error", async () => {
  const { pool } = observedPool();
  await withStorage(
    pool,
    async (storage) => {
      const id = await commitConversation(storage);
      await holdConnection(pool, 2000);
      const started = performance.now();
      await expect(storage.conversation(id, context)).rejects.toThrow(
        "timeout exceeded when trying to connect",
      );
      // At least one retry ran; the window opened at the first failure, one pool wait in, and no retry started after
      // it, so the last ends within one more pool wait.
      const elapsed = performance.now() - started;
      expect(elapsed).toBeGreaterThanOrEqual(2 * waitMs);
      expect(elapsed).toBeLessThan(waitMs + 500 + waitMs + 200);
    },
    { transientRetryMs: 500 },
  );
});

test("a read whose caller is cancelled stops retrying", async () => {
  const { pool } = observedPool();
  await withStorage(pool, async (storage) => {
    const id = await commitConversation(storage);
    await holdConnection(pool, 2000);
    const controller = new AbortController();
    void sleep(waitMs + 50).then(() => controller.abort());
    const started = performance.now();
    await expect(
      storage.conversation(id, withAbortSignal(controller.signal, context)),
    ).rejects.toThrow("timeout exceeded when trying to connect");
    expect(performance.now() - started).toBeLessThan(3 * waitMs + 200);
  });
});
