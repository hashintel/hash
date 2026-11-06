/**
 * Pi Durable `Storage` over Postgres: a port of 1.5.0's `SqliteStorage` (`dist/storage/sqlite/storage.js`) onto `pg`,
 * one Postgres schema per storage. The tables, ID and sequence bookkeeping, and document rules follow SQLite's; where
 * the two differ the comment says why.
 */
/* oxlint-disable eslint/no-await-in-loop -- A transaction's statements run in order on one client, and a fork walk needs each parent before the next. */
import { randomUUID } from "node:crypto";

import { apply, type Op } from "@earendil-works/chord/delta";
import {
  type ConversationId,
  type ConversationQuery,
  type ConversationRecord,
  type Cursor,
  type CommitResult,
  type DocumentAddress,
  type DocumentContent,
  type DocumentCopySource,
  type DocumentCreate,
  type DocumentId,
  type DocumentPoint,
  type DocumentQuery,
  type DocumentRecord,
  type EntryId,
  type EntryQuery,
  type EntryRecord,
  type Id,
  type JsonObject,
  type Page,
  type ScanOrder,
  type Seq,
  type Storage,
  StorageRequestError,
  type StorageWrite,
  type StoredDocument,
  type SubmissionId,
  type SubmissionQuery,
  type SubmissionRecord,
  type TaskId,
  type TaskQuery,
} from "@earendil-works/pi-durable";
import {
  Pool,
  type PoolClient,
  type PoolConfig,
  type QueryResultRow,
} from "pg";

import {
  createPostgresMigrations,
  createPostgresTables,
  type PostgresTables,
} from "./postgres-storage/migrations";

type StoredTask = NonNullable<Awaited<ReturnType<Storage["task"]>>>;
type StoredEntry = NonNullable<Awaited<ReturnType<Storage["entry"]>>>;
type HeadMarker = NonNullable<
  Awaited<ReturnType<Storage["findLatestHeadMarker"]>>
>;
type RecordType = "conversation" | "entry" | "task" | "submission" | "document";

type Executor = Pick<PoolClient, "query">;

/**
 * `executor` watched for failed queries: a batch check that fails after one of them failed in the database, an
 * unknown outcome, rather than refusing its batch by one of Durable's own rules.
 */
const watchQueries = (executor: Executor) => {
  let failed = false;
  const watched: Executor = {
    query: (async (...args: Parameters<Executor["query"]>) => {
      try {
        return await (
          executor.query as (...queryArgs: unknown[]) => Promise<unknown>
        )(...args);
      } catch (error) {
        failed = true;
        throw error;
      }
    }) as Executor["query"],
  };
  return {
    executor: watched,
    reset: () => {
      failed = false;
    },
    failed: () => failed,
  };
};

type DocumentAction = {
  create?: DocumentCreate;
  content?: DocumentContent;
  copy?: DocumentCopySource;
  retire: boolean;
};

const idFromNumber = <I extends Id<string>>(value: number) => value as I;
const seqFromNumber = (value: number) => value as Seq;

const parseJson = <T>(value: string) => JSON.parse(value) as T;
const encodeJson = (value: unknown) => JSON.stringify(value);
// As in SQLite: JSON-encoding indexed strings keeps lone surrogates lossless.
const encodeIndexedString = (value: string) => JSON.stringify(value);

const get = async <Row extends QueryResultRow>(
  executor: Executor,
  sql: string,
  params: unknown[] = [],
): Promise<Row | undefined> => (await executor.query<Row>(sql, params)).rows[0];

const all = async <Row extends QueryResultRow>(
  executor: Executor,
  sql: string,
  params: unknown[] = [],
): Promise<Row[]> => (await executor.query<Row>(sql, params)).rows;

/** Push one parameter and return its `$n` placeholder. */
const bind = (params: unknown[], value: unknown) => {
  params.push(value);
  return `$${params.length}`;
};

/** Queries arrive from callers outside the type system too, so the order is checked at runtime. */
const scanOrder = (value: unknown): ScanOrder | undefined => {
  if (value === undefined || value === "ascending" || value === "descending") {
    return value;
  }
  throw new StorageRequestError(`Invalid scan order: ${JSON.stringify(value)}`);
};

const scanStart = (
  query: { readonly order?: unknown },
  cursor: Cursor | undefined,
  fallback: ScanOrder,
): { order: ScanOrder; after: number | undefined } => {
  const requested = scanOrder(query.order);
  if (cursor === undefined) {
    return { order: requested ?? fallback, after: undefined };
  }
  const { after, order: stored } = cursor;
  if (typeof after !== "number" || !Number.isSafeInteger(after)) {
    throw new StorageRequestError("Invalid storage cursor");
  }
  if (
    stored !== undefined &&
    stored !== "ascending" &&
    stored !== "descending"
  ) {
    throw new StorageRequestError("Invalid storage cursor");
  }
  const order = stored ?? fallback;
  if (requested !== undefined && requested !== order) {
    throw new StorageRequestError(
      `The cursor continues a ${order} scan; the query asks for ${requested}`,
    );
  }
  return { order, after };
};

const page = <T extends { readonly id: number }>(
  values: readonly T[],
  limit: number,
  order: ScanOrder = "ascending",
): Page<T, Cursor> => {
  const items = values.slice(0, limit);
  const last = items.at(-1);
  if (values.length <= limit || last === undefined) {
    return { items };
  }
  return { items, next: { after: last.id, order } };
};

/** The ID condition and `ORDER BY` direction of a table scan. */
const scanSql = (
  params: unknown[],
  start: { order: ScanOrder; after: number | undefined },
) =>
  start.order === "ascending"
    ? { clause: `id > ${bind(params, start.after ?? -1)}`, direction: "ASC" }
    : {
        clause: `id < ${bind(params, start.after ?? Number.MAX_SAFE_INTEGER)}`,
        direction: "DESC",
      };

const scopeColumns = (scope: DocumentRecord["scope"]) => {
  switch (scope.kind) {
    case "session":
      return { scopeKind: "session", ownerId: 0 };
    case "conversation":
      return { scopeKind: "conversation", ownerId: scope.conversationId };
    case "task":
      return { scopeKind: "task", ownerId: scope.taskId };
  }
};

const addressParts = (address: DocumentAddress) => ({
  kind: encodeIndexedString(address.kind),
  ...scopeColumns(address.scope),
  family: address.key !== undefined,
  keyValue: encodeIndexedString(address.key ?? ""),
});

const addressKey = (address: DocumentAddress) => {
  const parts = addressParts(address);
  return JSON.stringify([
    parts.kind,
    parts.scopeKind,
    parts.ownerId,
    parts.family,
    parts.keyValue,
  ]);
};

/** `WHERE` conditions selecting one logical document address. */
const addressSql = (params: unknown[], address: DocumentAddress) => {
  const parts = addressParts(address);
  return [
    `kind = ${bind(params, parts.kind)}`,
    `scope_kind = ${bind(params, parts.scopeKind)}`,
    `owner_id = ${bind(params, parts.ownerId)}`,
    `family = ${bind(params, parts.family)}`,
    `key_value = ${bind(params, parts.keyValue)}`,
  ].join(" AND ");
};

/** `WHERE` conditions selecting incarnations alive at one point. */
const aliveSql = (params: unknown[], at: DocumentPoint) => {
  if (at === "current") {
    return "retired_at IS NULL";
  }
  const point = bind(params, at);
  return `created_at <= ${point} AND (retired_at IS NULL OR retired_at > ${point})`;
};

const isAliveAt = (record: DocumentRecord, at: DocumentPoint) => {
  if (at === "current") {
    return record.retiredAt === undefined;
  }
  return (
    record.createdAt <= at &&
    (record.retiredAt === undefined || at < record.retiredAt)
  );
};

const isCurrentOnly = (record: DocumentRecord | DocumentCreate) =>
  record.scope.kind !== "conversation" || record.history === "latest";

const writeId = (write: StorageWrite) => {
  switch (write.type) {
    case "conversation":
    case "entry":
    case "task":
    case "submission":
      return write.value.id;
    case "document.create":
    case "document.copy":
      return write.record.id;
    case "document.change":
    case "document.retire":
      return undefined;
  }
};

const prepareDocumentActions = (writes: readonly StorageWrite[]) => {
  const actions = new Map<DocumentId, DocumentAction>();
  for (const write of writes) {
    if (
      write.type !== "document.create" &&
      write.type !== "document.copy" &&
      write.type !== "document.change" &&
      write.type !== "document.retire"
    ) {
      continue;
    }
    const id =
      write.type === "document.create" || write.type === "document.copy"
        ? write.record.id
        : write.id;
    let action = actions.get(id);
    if (action === undefined) {
      action = { retire: false };
      actions.set(id, action);
    }
    switch (write.type) {
      case "document.create":
      case "document.copy":
        if (
          action.create !== undefined ||
          action.content !== undefined ||
          action.copy !== undefined
        ) {
          throw new Error(`Document ${id} has more than one content command`);
        }
        action.create = write.record;
        if (write.type === "document.create") {
          action.content = write.content;
        } else {
          action.copy = write.source;
        }
        break;
      case "document.change":
        if (action.content !== undefined || action.copy !== undefined) {
          throw new Error(`Document ${id} has more than one content command`);
        }
        action.content = write.content;
        break;
      case "document.retire":
        if (action.retire) {
          throw new Error(`Document ${id} is retired more than once`);
        }
        action.retire = true;
        break;
    }
  }
  return actions;
};

/**
 * Open (creating if needed) the Pi Durable tables in one Postgres schema. Given a `PoolConfig`, the storage owns a `pg`
 * pool built from it and ends it on `close()`; given a `Pool`, it shares that pool and leaves ending it to the caller.
 * Dropping the schema is the caller's business.
 *
 * One storage owns a schema at a time. Opening takes ownership from whichever storage held it: that storage's next
 * commit fails, which fails its Session, so a process that lost the schema stops writing instead of corrupting it.
 * `readOnly` opens without taking ownership, for a read-only Harness; its commits fail the same way.
 */
export const openPostgresStorage = async (options: {
  readonly pool: PoolConfig | Pool;
  readonly schema: string;
  readonly readOnly?: boolean;
}): Promise<PostgresStorage> => {
  const tables = createPostgresTables(options.schema);
  const ownsPool = !(options.pool instanceof Pool);
  const pool =
    options.pool instanceof Pool ? options.pool : new Pool(options.pool);
  const ownerToken = options.readOnly === true ? undefined : randomUUID();
  if (ownsPool) {
    // An idle client's connection error removes that client from the pool; the next query surfaces a lasting failure.
    pool.on("error", () => {});
  }
  try {
    const nextId = await inTransaction(pool, "BEGIN", async (client) => {
      // Serializes concurrent opens of one schema; DDL is transactional in Postgres.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        options.schema,
      ]);
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${options.schema}"`);
      await client.query(
        `CREATE TABLE IF NOT EXISTS ${tables.durableSchema} (version INTEGER PRIMARY KEY)`,
      );
      const current = Number(
        (
          await get<{ version: number | null }>(
            client,
            `SELECT max(version) AS version FROM ${tables.durableSchema}`,
          )
        )?.version ?? 0,
      );
      for (const migration of createPostgresMigrations(tables)) {
        if (migration.version <= current) {
          continue;
        }
        for (const statement of migration.statements) {
          await client.query(statement);
        }
        await client.query(
          `INSERT INTO ${tables.durableSchema} (version) VALUES ($1)`,
          [migration.version],
        );
      }
      if (ownerToken !== undefined) {
        // Waits for the metadata row lock, so a commit of the previous owner lands before or fails after this.
        await client.query(
          `UPDATE ${tables.durableMetadata} SET owner_token = $1 WHERE singleton = 1`,
          [ownerToken],
        );
      }
      const metadata = await get<{ next_id: string }>(
        client,
        `SELECT next_id FROM ${tables.durableMetadata} WHERE singleton = 1`,
      );
      if (metadata === undefined) {
        throw new Error("Durable Postgres metadata is missing");
      }
      return Number(metadata.next_id);
    });
    return new PostgresStorage(pool, tables, nextId, ownerToken, ownsPool);
  } catch (error) {
    if (ownsPool) {
      await pool.end().catch(() => {
        // Preserve the initialization failure.
      });
    }
    throw error;
  }
};

const inTransaction = async <T>(
  pool: Pool,
  begin: string,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query(begin);
    const result = await run(client);
    await client.query("COMMIT");
    client.release();
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
      client.release();
    } catch {
      client.release(true);
    }
    throw error;
  }
};

export class PostgresStorage implements Storage {
  private closed = false;
  private closing: Promise<void> | undefined;
  private admitted = 0;
  private drained: (() => void) | undefined;

  constructor(
    private readonly pool: Pool,
    private readonly tables: PostgresTables,
    private nextId: number,
    /** Absent when opened read-only. */
    private readonly ownerToken: string | undefined,
    /** False when the caller passed a pool it shares and ends itself. */
    private readonly ownsPool: boolean,
  ) {}

  /**
   * Commit `batches` in one transaction, each with its own seq. Each batch is checked before it writes anything, against
   * the state the earlier ones left; the first one Durable's rules refuse ends the call and the transaction commits the
   * ones before it. A database failure rejects the call and rolls all of it back. As in SQLite, no savepoints: the
   * checks run before the writes.
   */
  async commit(
    batches: readonly (readonly StorageWrite[])[],
    receive: (index: number, seq: Seq) => void,
    _context: unknown,
  ): Promise<CommitResult> {
    return this.admit(async () => {
      const seqs: Seq[] = [];
      let refused: { error: unknown } | undefined;
      let candidateNextId = this.nextId;
      await inTransaction(this.pool, "BEGIN", async (client) => {
        // The row lock serializes commits, and opens taking ownership, across processes.
        const metadata = await get<{
          next_id: string;
          next_seq: string;
          owner_token: string | null;
        }>(
          client,
          `SELECT next_id, next_seq, owner_token FROM ${this.tables.durableMetadata} WHERE singleton = 1 FOR UPDATE`,
        );
        if (metadata === undefined) {
          throw new Error("Durable Postgres metadata is missing");
        }
        if (this.ownerToken === undefined) {
          throw new Error(
            `Postgres storage ${this.tables.durableMetadata} was opened read-only and cannot commit`,
          );
        }
        if (metadata.owner_token !== this.ownerToken) {
          throw new Error(
            `Postgres storage ${this.tables.durableMetadata} is owned by a storage opened later; this one can no longer commit`,
          );
        }
        let next = Number(metadata.next_seq);
        const watch = watchQueries(client);
        const checked = watch.executor;
        for (const writes of batches) {
          watch.reset();
          let documentActions: Map<DocumentId, DocumentAction>;
          let freshIds: [number, RecordType][];
          try {
            documentActions = prepareDocumentActions(writes);
            freshIds = await this.checkGlobalIds(checked, writes);
            await this.checkDocumentActions(checked, documentActions);
            await this.resolveCopies(checked, documentActions);
          } catch (error) {
            if (watch.failed()) {
              throw error;
            }
            refused = { error };
            break;
          }
          const seq = seqFromNumber(next++);
          await this.insertRecordIds(client, freshIds);
          for (const write of writes) {
            await this.applyTableWrite(client, write, seq);
          }
          await this.applyDocumentActions(client, documentActions, seq);
          seqs.push(seq);
          candidateNextId = Math.max(
            candidateNextId,
            this.candidateNextId(writes),
          );
        }
        if (seqs.length > 0) {
          await client.query(
            `UPDATE ${this.tables.durableMetadata} SET next_id = $1, next_seq = $2 WHERE singleton = 1`,
            [String(Math.max(Number(metadata.next_id), candidateNextId)), next],
          );
        }
      });
      this.nextId = Math.max(this.nextId, candidateNextId);
      // `COMMIT` returned: the stored batches are durable.
      for (const [index, seq] of seqs.entries()) {
        receive(index, seq);
      }
      return refused === undefined
        ? { stored: seqs.length }
        : { stored: seqs.length, refused: refused.error };
    });
  }

  async mintId<I extends Id<string>>(): Promise<I> {
    this.assertOpen();
    if (!Number.isSafeInteger(this.nextId)) {
      throw new Error("ID space is exhausted");
    }
    return idFromNumber<I>(this.nextId++);
  }

  async conversation(
    id: ConversationId,
    _context: unknown,
  ): Promise<ConversationRecord | undefined> {
    return this.admit(() => this.readConversation(id));
  }

  async scanConversations(
    query: ConversationQuery,
    limit: number,
    cursor: Cursor | undefined,
    _context: unknown,
  ): Promise<Page<ConversationRecord, Cursor>> {
    return this.admit(async () => {
      const start = scanStart(query, cursor, "ascending");
      const params: unknown[] = [];
      const scan = scanSql(params, start);
      const clauses = [scan.clause];
      if (query.ownerConversationId !== undefined) {
        clauses.push(
          `owner_conversation_id = ${bind(params, query.ownerConversationId)}`,
        );
      }
      if (query.ownerTaskId !== undefined) {
        clauses.push(`owner_task_id = ${bind(params, query.ownerTaskId)}`);
      }
      const rows = await all<{ record: string }>(
        this.pool,
        `SELECT record FROM ${this.tables.conversations} WHERE ${clauses.join(" AND ")}
          ORDER BY id ${scan.direction} LIMIT ${bind(params, limit + 1)}`,
        params,
      );
      return page(
        rows.map((row) => parseJson<ConversationRecord>(row.record)),
        limit,
        start.order,
      );
    });
  }

  entry(id: EntryId, context: unknown): Promise<StoredEntry | undefined>;
  entry(
    conversationId: ConversationId,
    id: EntryId,
    context: unknown,
  ): Promise<StoredEntry | undefined>;
  async entry(
    idOrConversationId: number,
    idOrContext: unknown,
    context?: unknown,
  ): Promise<StoredEntry | undefined> {
    return this.admit(async () => {
      const id =
        context === undefined
          ? idFromNumber<EntryId>(idOrConversationId)
          : typeof idOrContext === "number"
            ? idFromNumber<EntryId>(idOrContext)
            : undefined;
      if (id === undefined) {
        throw new StorageRequestError("Storage.entry() requires an entry ID");
      }
      let conversation =
        context === undefined
          ? undefined
          : await this.knownConversation(
              idFromNumber<ConversationId>(idOrConversationId),
            );
      const row = await get<{ record: string; commit_seq: string }>(
        this.pool,
        `SELECT record, commit_seq FROM ${this.tables.entries} WHERE id = $1`,
        [id],
      );
      if (row === undefined) {
        return undefined;
      }
      const entry = parseJson<EntryRecord>(row.record);
      if (conversation !== undefined) {
        let upperEntryId = Number.POSITIVE_INFINITY;
        while (conversation.id !== entry.conversationId) {
          if (conversation.parent === undefined) {
            return undefined;
          }
          upperEntryId = Math.min(upperEntryId, conversation.parent.at);
          conversation = await this.requireConversation(
            conversation.parent.conversationId,
          );
        }
        if (entry.id > upperEntryId) {
          return undefined;
        }
      }
      return { entry, commitSeq: seqFromNumber(Number(row.commit_seq)) };
    });
  }

  async findLatestHeadMarker(
    conversationId: ConversationId,
    atOrBeforeEntryId: EntryId | undefined,
    _context: unknown,
  ): Promise<HeadMarker | undefined> {
    return this.admit(async () => {
      let conversation: ConversationRecord | undefined =
        await this.knownConversation(conversationId);
      let upper: number | undefined = atOrBeforeEntryId;
      while (conversation !== undefined) {
        const params: unknown[] = [conversation.id];
        const row = await get<{ record: string }>(
          this.pool,
          `SELECT record FROM ${this.tables.entries}
            WHERE conversation_id = $1 AND head IS NOT NULL
            ${upper === undefined ? "" : `AND id <= ${bind(params, upper)}`}
            ORDER BY id DESC LIMIT 1`,
          params,
        );
        if (row !== undefined) {
          return parseJson<HeadMarker>(row.record);
        }
        const parent = conversation.parent;
        conversation = undefined;
        if (parent !== undefined) {
          upper = upper === undefined ? parent.at : Math.min(upper, parent.at);
          conversation = await this.requireConversation(parent.conversationId);
        }
      }
      return undefined;
    });
  }

  async scanEntries(
    query: EntryQuery,
    limit: number,
    cursor: Cursor | undefined,
    _context: unknown,
  ): Promise<Page<EntryRecord, Cursor>> {
    return this.admit(async () => {
      const { order, after } = scanStart(query, cursor, "descending");
      // Each segment is one conversation of the fork chain, capped by the fork point of the conversation below it.
      const segments: { conversationId: ConversationId; upper?: number }[] = [];
      let conversation: ConversationRecord | undefined =
        await this.knownConversation(query.conversationId);
      let upper: number | undefined = query.maxEntryId;
      while (conversation !== undefined) {
        segments.push({ conversationId: conversation.id, upper });
        const parent = conversation.parent;
        conversation = undefined;
        if (parent !== undefined) {
          upper = upper === undefined ? parent.at : Math.min(upper, parent.at);
          if (query.minEntryId === undefined || upper >= query.minEntryId) {
            conversation = await this.requireConversation(
              parent.conversationId,
            );
          }
        }
      }
      let lower: number | undefined = query.minEntryId;
      let cap: number | undefined;
      if (after !== undefined) {
        if (order === "ascending") {
          lower = Math.max(lower ?? after + 1, after + 1);
        } else {
          cap = after - 1;
        }
      }
      if (order === "ascending") {
        segments.reverse();
      }
      const values: EntryRecord[] = [];
      for (const segment of segments) {
        const params: unknown[] = [segment.conversationId];
        const clauses = ["conversation_id = $1"];
        if (lower !== undefined) {
          clauses.push(`id >= ${bind(params, lower)}`);
        }
        const segmentUpper =
          cap === undefined
            ? segment.upper
            : Math.min(segment.upper ?? cap, cap);
        if (segmentUpper !== undefined) {
          clauses.push(`id <= ${bind(params, segmentUpper)}`);
        }
        const rows = await all<{ record: string }>(
          this.pool,
          `SELECT record FROM ${this.tables.entries} WHERE ${clauses.join(" AND ")}
            ORDER BY id ${order === "ascending" ? "ASC" : "DESC"}
            LIMIT ${bind(params, limit + 1 - values.length)}`,
          params,
        );
        values.push(...rows.map((row) => parseJson<EntryRecord>(row.record)));
        if (values.length > limit) {
          break;
        }
      }
      return page(values, limit, order);
    });
  }

  async task(id: TaskId, _context: unknown): Promise<StoredTask | undefined> {
    return this.admit(async () => {
      const row = await get<{ record: string }>(
        this.pool,
        `SELECT record FROM ${this.tables.tasks} WHERE id = $1`,
        [id],
      );
      return row === undefined ? undefined : parseJson<StoredTask>(row.record);
    });
  }

  async scanTasks(
    query: TaskQuery,
    limit: number,
    cursor: Cursor | undefined,
    _context: unknown,
  ): Promise<Page<StoredTask, Cursor>> {
    return this.admit(async () => {
      const start = scanStart(query, cursor, "ascending");
      const params: unknown[] = [];
      const scan = scanSql(params, start);
      const clauses = [scan.clause];
      if (query.conversationId !== undefined) {
        clauses.push(`conversation_id = ${bind(params, query.conversationId)}`);
      }
      if (query.kind !== undefined) {
        clauses.push(`kind = ${bind(params, encodeIndexedString(query.kind))}`);
      }
      if (query.status !== undefined) {
        clauses.push(`status = ${bind(params, query.status)}`);
      }
      if (query.abortRequested !== undefined) {
        clauses.push(`abort_requested = ${bind(params, query.abortRequested)}`);
      }
      if (query.background !== undefined) {
        clauses.push(`background = ${bind(params, query.background)}`);
      }
      const rows = await all<{ record: string }>(
        this.pool,
        `SELECT record FROM ${this.tables.tasks} WHERE ${clauses.join(" AND ")}
          ORDER BY id ${scan.direction} LIMIT ${bind(params, limit + 1)}`,
        params,
      );
      return page(
        rows.map((row) => parseJson<StoredTask>(row.record)),
        limit,
        start.order,
      );
    });
  }

  async submission(
    id: SubmissionId,
    _context: unknown,
  ): Promise<SubmissionRecord | undefined> {
    return this.admit(async () => {
      const row = await get<{ record: string }>(
        this.pool,
        `SELECT record FROM ${this.tables.submissions} WHERE id = $1`,
        [id],
      );
      return row === undefined
        ? undefined
        : parseJson<SubmissionRecord>(row.record);
    });
  }

  async scanSubmissions(
    query: SubmissionQuery,
    limit: number,
    cursor: Cursor | undefined,
    _context: unknown,
  ): Promise<Page<SubmissionRecord, Cursor>> {
    return this.admit(async () => {
      const start = scanStart(query, cursor, "ascending");
      const params: unknown[] = [];
      const scan = scanSql(params, start);
      const clauses = [scan.clause];
      if (query.conversationId !== undefined) {
        clauses.push(`conversation_id = ${bind(params, query.conversationId)}`);
      }
      if (query.status !== undefined) {
        clauses.push(`status = ${bind(params, query.status)}`);
      }
      const rows = await all<{ record: string }>(
        this.pool,
        `SELECT record FROM ${this.tables.submissions} WHERE ${clauses.join(" AND ")}
          ORDER BY id ${scan.direction} LIMIT ${bind(params, limit + 1)}`,
        params,
      );
      return page(
        rows.map((row) => parseJson<SubmissionRecord>(row.record)),
        limit,
        start.order,
      );
    });
  }

  async submissionByRequest(
    conversationId: ConversationId,
    requestId: string,
    _context: unknown,
  ): Promise<SubmissionRecord | undefined> {
    return this.admit(async () => {
      const row = await get<{ record: string }>(
        this.pool,
        `SELECT record FROM ${this.tables.submissions} WHERE conversation_id = $1 AND request_id = $2`,
        [conversationId, encodeIndexedString(requestId)],
      );
      return row === undefined
        ? undefined
        : parseJson<SubmissionRecord>(row.record);
    });
  }

  async findDocument(
    address: DocumentAddress,
    at: DocumentPoint,
    _context: unknown,
  ): Promise<DocumentRecord | undefined> {
    return this.admit(async () => {
      const params: unknown[] = [];
      const row = await get<{ record: string }>(
        this.pool,
        `SELECT record FROM ${this.tables.documents}
          WHERE ${addressSql(params, address)} AND ${aliveSql(params, at)}
          ORDER BY created_at DESC LIMIT 1`,
        params,
      );
      return row === undefined
        ? undefined
        : parseJson<DocumentRecord>(row.record);
    });
  }

  async document(
    id: DocumentId,
    at: DocumentPoint,
    _context: unknown,
  ): Promise<StoredDocument | undefined> {
    // The record and revision queries must observe one committed state; a commit between them can replace the base.
    return this.admit(() =>
      inTransaction(
        this.pool,
        "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
        (client) => this.materializeDocument(client, id, at),
      ),
    );
  }

  async scanDocuments(
    query: DocumentQuery,
    limit: number,
    cursor: Cursor | undefined,
    _context: unknown,
  ): Promise<Page<DocumentRecord, Cursor>> {
    return this.admit(async () => {
      const after = cursor?.after;
      if (
        after !== undefined &&
        (typeof after !== "number" || !Number.isSafeInteger(after))
      ) {
        throw new StorageRequestError("Invalid storage cursor");
      }
      const scope = scopeColumns(query.scope);
      const params: unknown[] = [];
      const clauses = [
        `scope_kind = ${bind(params, scope.scopeKind)}`,
        `owner_id = ${bind(params, scope.ownerId)}`,
        `id > ${bind(params, after ?? -1)}`,
        aliveSql(params, query.at),
      ];
      if (query.kind !== undefined) {
        clauses.push(`kind = ${bind(params, encodeIndexedString(query.kind))}`);
      }
      const rows = await all<{ record: string }>(
        this.pool,
        `SELECT record FROM ${this.tables.documents} WHERE ${clauses.join(" AND ")}
          ORDER BY id LIMIT ${bind(params, limit + 1)}`,
        params,
      );
      return page(
        rows.map((row) => parseJson<DocumentRecord>(row.record)),
        limit,
      );
    });
  }

  close(_context: unknown): Promise<void> {
    if (this.closing === undefined) {
      this.closed = true;
      this.closing = (async () => {
        if (this.admitted > 0) {
          await new Promise<void>((resolve) => {
            this.drained = resolve;
          });
        }
        if (this.ownsPool) {
          await this.pool.end();
        }
      })();
    }
    return this.closing;
  }

  /** Run one operation; `close()` waits for admitted operations so none reaches an ended pool. */
  private async admit<T>(operation: () => Promise<T>): Promise<T> {
    this.assertOpen();
    this.admitted++;
    try {
      return await operation();
    } finally {
      if (--this.admitted === 0) {
        this.drained?.();
      }
    }
  }

  private assertOpen() {
    if (this.closed) {
      throw new Error("PostgresStorage is closed");
    }
  }

  private async readConversation(
    id: ConversationId,
  ): Promise<ConversationRecord | undefined> {
    const row = await get<{ record: string }>(
      this.pool,
      `SELECT record FROM ${this.tables.conversations} WHERE id = $1`,
      [id],
    );
    return row === undefined
      ? undefined
      : parseJson<ConversationRecord>(row.record);
  }

  /** A conversation named by a read request; an unknown one is the caller's error. */
  private async knownConversation(
    id: ConversationId,
  ): Promise<ConversationRecord> {
    const conversation = await this.readConversation(id);
    if (conversation === undefined) {
      throw new StorageRequestError(`Unknown conversation: ${id}`);
    }
    return conversation;
  }

  /** A fork parent the Session committed earlier; conversations are immutable, so it is always present. */
  private async requireConversation(
    id: ConversationId,
  ): Promise<ConversationRecord> {
    const conversation = await this.readConversation(id);
    if (conversation === undefined) {
      throw new Error(`Fork parent conversation ${id} is missing`);
    }
    return conversation;
  }

  private async materializeDocument(
    executor: Executor,
    id: DocumentId,
    at: DocumentPoint,
  ): Promise<StoredDocument | undefined> {
    const row = await get<{ record: string }>(
      executor,
      `SELECT record FROM ${this.tables.documents} WHERE id = $1`,
      [id],
    );
    if (row === undefined) {
      return undefined;
    }
    const record = parseJson<DocumentRecord>(row.record);
    if (at !== "current" && isCurrentOnly(record)) {
      throw new StorageRequestError(
        `Document ${id} does not retain historical content`,
      );
    }
    if (!isAliveAt(record, at)) {
      return undefined;
    }
    const upper = at === "current" ? Number.MAX_SAFE_INTEGER : at;
    const base = await get<{ seq: string; version: number; content: string }>(
      executor,
      `SELECT seq, version, content FROM ${this.tables.documentRevisions}
        WHERE document_id = $1 AND kind = 'base' AND seq <= $2 ORDER BY seq DESC LIMIT 1`,
      [id, upper],
    );
    if (base === undefined) {
      throw new Error(`Document ${id} is missing a required base`);
    }
    let value = parseJson<JsonObject>(base.content);
    const tail = await all<{ kind: string; version: number; content: string }>(
      executor,
      `SELECT kind, version, content FROM ${this.tables.documentRevisions}
        WHERE document_id = $1 AND seq > $2 AND seq <= $3 ORDER BY seq`,
      [id, base.seq, upper],
    );
    for (const revision of tail) {
      if (revision.kind !== "delta" || revision.version !== base.version) {
        throw new Error(
          `Document ${id} crosses a stored version boundary without a base`,
        );
      }
      value = apply(value, parseJson<Op[]>(revision.content));
    }
    return {
      record,
      version: base.version,
      value,
      deltasSinceBase: tail.length,
    };
  }

  private candidateNextId(writes: readonly StorageWrite[]) {
    let nextId = this.nextId;
    for (const write of writes) {
      const id = writeId(write);
      if (id !== undefined) {
        nextId = Math.max(nextId, id + 1);
      }
    }
    return nextId;
  }

  /**
   * Check every written ID against the global namespace, then claim the new ones. SQLite checks and claims one row at a
   * time; here it is one `SELECT` and one `INSERT` per commit, since each statement is a network round trip.
   */
  /** Durable's ID rules for one batch; returns the IDs it claims that no earlier commit stored. */
  private async checkGlobalIds(
    executor: Executor,
    writes: readonly StorageWrite[],
  ): Promise<[number, RecordType][]> {
    const claimed = new Map<number, RecordType>();
    const ordered: { id: number; type: RecordType }[] = [];
    for (const write of writes) {
      if (
        write.type === "document.change" ||
        write.type === "document.retire"
      ) {
        continue;
      }
      const document =
        write.type === "document.create" || write.type === "document.copy";
      ordered.push({
        id: document ? write.record.id : write.value.id,
        type: document ? "document" : write.type,
      });
    }
    if (ordered.length === 0) {
      return [];
    }
    const existing = new Map(
      (
        await all<{ id: string; record_type: RecordType }>(
          executor,
          `SELECT id, record_type FROM ${this.tables.recordIds} WHERE id = ANY($1::bigint[])`,
          [ordered.map(({ id }) => id)],
        )
      ).map((row) => [Number(row.id), row.record_type]),
    );
    for (const { id, type } of ordered) {
      const stored = existing.get(id);
      const earlier = claimed.get(id);
      if (type === "conversation" || type === "entry" || type === "document") {
        if (stored !== undefined) {
          throw new Error(`ID ${id} already belongs to ${stored}`);
        }
        if (earlier !== undefined) {
          throw new Error(`ID ${id} is written more than once`);
        }
      } else {
        if (stored !== undefined && stored !== type) {
          throw new Error(`ID ${id} already belongs to ${stored}`);
        }
        if (earlier !== undefined && earlier !== type) {
          throw new Error(`ID ${id} is written as two record types`);
        }
      }
      claimed.set(id, type);
    }
    return [...claimed].filter(([id]) => !existing.has(id));
  }

  private async insertRecordIds(
    executor: Executor,
    fresh: readonly [number, RecordType][],
  ) {
    if (fresh.length > 0) {
      await executor.query(
        `INSERT INTO ${this.tables.recordIds} (id, record_type)
          SELECT * FROM unnest($1::bigint[], $2::text[])`,
        [fresh.map(([id]) => id), fresh.map(([, type]) => type)],
      );
    }
  }

  private async checkDocumentActions(
    executor: Executor,
    actions: ReadonlyMap<DocumentId, DocumentAction>,
  ) {
    const liveCounts = new Map<string, number>();
    for (const [id, action] of actions) {
      if (action.copy !== undefined && actions.has(action.copy.id)) {
        throw new Error(
          `Document copy ${id} source is changed in the copy batch`,
        );
      }
      const row = await get<{ record: string }>(
        executor,
        `SELECT record FROM ${this.tables.documents} WHERE id = $1`,
        [id],
      );
      const existing =
        row === undefined ? undefined : parseJson<DocumentRecord>(row.record);
      if (action.create === undefined && existing === undefined) {
        throw new Error(`Unknown document: ${id}`);
      }
      if (action.create !== undefined && existing !== undefined) {
        throw new Error(`Document ${id} already exists`);
      }
      if (existing?.retiredAt !== undefined) {
        throw new Error(`Document ${id} is retired`);
      }
      if (action.content?.kind === "delta") {
        const previous = await get<{ version: number }>(
          executor,
          `SELECT version FROM ${this.tables.documentRevisions} WHERE document_id = $1 ORDER BY seq DESC LIMIT 1`,
          [id],
        );
        if (previous === undefined) {
          throw new Error(`Document ${id} delta has no base`);
        }
        if (previous.version !== action.content.version) {
          throw new Error(`Document ${id} version transition requires a base`);
        }
      }
      const record = action.create ?? existing;
      if (record === undefined) {
        continue;
      }
      const key = addressKey(record);
      let live = liveCounts.get(key);
      if (live === undefined) {
        const params: unknown[] = [];
        const current = await get<{ id: string }>(
          executor,
          `SELECT id FROM ${this.tables.documents}
            WHERE ${addressSql(params, record)} AND retired_at IS NULL LIMIT 1`,
          params,
        );
        live = current === undefined ? 0 : 1;
      }
      if (action.retire && existing !== undefined) {
        live--;
      }
      if (action.create !== undefined && !action.retire) {
        live++;
      }
      liveCounts.set(key, live);
    }
    for (const live of liveCounts.values()) {
      if (live > 1) {
        throw new Error("Document address already has a current incarnation");
      }
    }
  }

  private async applyTableWrite(
    executor: Executor,
    write: StorageWrite,
    seq: Seq,
  ) {
    switch (write.type) {
      case "conversation":
        await executor.query(
          `INSERT INTO ${this.tables.conversations} (id, owner_conversation_id, owner_task_id, record)
            VALUES ($1, $2, $3, $4)`,
          [
            write.value.id,
            write.value.owner?.conversationId ?? null,
            write.value.owner?.taskId ?? null,
            encodeJson(write.value),
          ],
        );
        break;
      case "entry":
        await executor.query(
          `INSERT INTO ${this.tables.entries} (id, conversation_id, head, commit_seq, record)
            VALUES ($1, $2, $3, $4, $5)`,
          [
            write.value.id,
            write.value.conversationId,
            write.value.head ?? null,
            seq,
            encodeJson(write.value),
          ],
        );
        break;
      case "task":
        await executor.query(
          `INSERT INTO ${this.tables.tasks} (id, conversation_id, kind, status, abort_requested, background, record)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (id) DO UPDATE SET conversation_id = excluded.conversation_id, kind = excluded.kind,
            status = excluded.status, abort_requested = excluded.abort_requested,
            background = excluded.background, record = excluded.record`,
          [
            write.value.id,
            write.value.conversationId,
            encodeIndexedString(write.value.kind),
            write.value.state.status,
            write.value.abortRequested,
            write.value.background,
            encodeJson(write.value),
          ],
        );
        break;
      case "submission":
        await executor.query(
          `INSERT INTO ${this.tables.submissions} (id, conversation_id, request_id, status, record)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (id) DO UPDATE SET conversation_id = excluded.conversation_id,
            request_id = excluded.request_id, status = excluded.status, record = excluded.record`,
          [
            write.value.id,
            write.value.conversationId,
            write.value.requestId === undefined
              ? null
              : encodeIndexedString(write.value.requestId),
            write.value.status,
            encodeJson(write.value),
          ],
        );
        break;
      case "document.create":
      case "document.copy":
      case "document.change":
      case "document.retire":
        break;
    }
  }

  private async applyDocumentActions(
    executor: Executor,
    actions: ReadonlyMap<DocumentId, DocumentAction>,
    seq: Seq,
  ) {
    for (const [id, action] of actions) {
      // Copies are resolved to their content by `resolveCopies()`.
      const content = action.content;
      let record: DocumentRecord;
      if (action.create !== undefined) {
        record = {
          ...action.create,
          createdAt: seq,
          ...(action.retire ? { retiredAt: seq } : {}),
        } as DocumentRecord;
        const parts = addressParts(record);
        await executor.query(
          `INSERT INTO ${this.tables.documents}
            (id, kind, family, key_value, scope_kind, owner_id, created_at, retired_at, record)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            id,
            parts.kind,
            parts.family,
            parts.keyValue,
            parts.scopeKind,
            parts.ownerId,
            seq,
            action.retire ? seq : null,
            encodeJson(record),
          ],
        );
      } else {
        const row = await get<{ record: string }>(
          executor,
          `SELECT record FROM ${this.tables.documents} WHERE id = $1`,
          [id],
        );
        if (row === undefined) {
          throw new Error(`Unknown document: ${id}`);
        }
        record = parseJson<DocumentRecord>(row.record);
      }
      if (content !== undefined) {
        if (content.kind === "base" && isCurrentOnly(record)) {
          await executor.query(
            `DELETE FROM ${this.tables.documentRevisions} WHERE document_id = $1`,
            [id],
          );
        }
        await executor.query(
          `INSERT INTO ${this.tables.documentRevisions} (document_id, seq, kind, version, content)
            VALUES ($1, $2, $3, $4, $5)`,
          [
            id,
            seq,
            content.kind,
            content.version,
            encodeJson(content.kind === "base" ? content.value : content.ops),
          ],
        );
      }
      if (action.retire) {
        if (action.create === undefined) {
          record = { ...record, retiredAt: seq };
          await executor.query(
            `UPDATE ${this.tables.documents} SET retired_at = $1, record = $2 WHERE id = $3`,
            [seq, encodeJson(record), id],
          );
        }
        if (isCurrentOnly(record)) {
          await executor.query(
            `DELETE FROM ${this.tables.documentRevisions} WHERE document_id = $1`,
            [id],
          );
        }
      }
    }
  }

  /** Resolve each copy to a base of its source's state before this batch, which may not change the source. */
  private async resolveCopies(
    executor: Executor,
    actions: ReadonlyMap<DocumentId, DocumentAction>,
  ) {
    for (const [id, action] of actions) {
      if (action.copy !== undefined && action.create !== undefined) {
        action.content = await this.copySource(
          executor,
          id,
          action.copy,
          action.create,
        );
      }
    }
  }

  /** The base a fork copy starts from: the source materialized at the cutoff, checked against the copied record. */
  private async copySource(
    executor: Executor,
    id: DocumentId,
    source: DocumentCopySource,
    create: DocumentCreate,
  ): Promise<DocumentContent> {
    try {
      const stored = await this.materializeDocument(
        executor,
        source.id,
        source.at,
      );
      if (stored === undefined) {
        throw new Error(`Fork source document ${source.id} cannot be read`);
      }
      if (
        stored.record.scope.kind !== "conversation" ||
        create.scope.kind !== "conversation" ||
        stored.record.kind !== create.kind ||
        stored.record.key !== create.key ||
        stored.record.history !== create.history ||
        stored.record.fork !== create.fork
      ) {
        throw new Error(
          `Fork source document ${source.id} does not match the copied record`,
        );
      }
      return { kind: "base", version: stored.version, value: stored.value };
    } catch (error) {
      throw new Error(`Document copy ${id} was rejected`, { cause: error });
    }
  }
}
