/**
 * Postgres rendering of Pi Durable's SQLite tables (`dist/storage/sqlite/migrations.js` in 1.4.0), one Postgres schema
 * per storage. Columns and indexes match SQLite's; SQLite's two migrations collapse into one because a new Postgres
 * schema has no history. Records stay JSON text rather than `jsonb`: `jsonb` rejects the `\u0000` and lone-surrogate
 * escapes that `JSON.stringify` writes, and the conformance suite stores lone surrogates.
 */

export type PostgresTables = {
  readonly durableSchema: string;
  readonly durableMetadata: string;
  readonly recordIds: string;
  readonly conversations: string;
  readonly entries: string;
  readonly tasks: string;
  readonly submissions: string;
  readonly documents: string;
  readonly documentRevisions: string;
};

/** Schema names are interpolated into SQL, so only plain lowercase identifiers are accepted. */
const schemaNamePattern = /^[a-z_][a-z0-9_]{0,62}$/u;

export const createPostgresTables = (schema: string): PostgresTables => {
  if (!schemaNamePattern.test(schema)) {
    throw new Error(
      `Postgres schema name must match ${schemaNamePattern.source}: ${schema}`,
    );
  }
  const table = (name: string) => `"${schema}".${name}`;
  return {
    durableSchema: table("durable_schema"),
    durableMetadata: table("durable_metadata"),
    recordIds: table("record_ids"),
    conversations: table("conversations"),
    entries: table("entries"),
    tasks: table("tasks"),
    submissions: table("submissions"),
    documents: table("documents"),
    documentRevisions: table("document_revisions"),
  };
};

export const createPostgresMigrations = (
  tables: PostgresTables,
): readonly {
  readonly version: number;
  readonly statements: readonly string[];
}[] => [
  {
    version: 1,
    statements: [
      `CREATE TABLE ${tables.durableMetadata} (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        next_id BIGINT NOT NULL,
        next_seq BIGINT NOT NULL
      )`,
      `INSERT INTO ${tables.durableMetadata} (singleton, next_id, next_seq) VALUES (1, 2, 1)`,
      `CREATE TABLE ${tables.recordIds} (
        id BIGINT PRIMARY KEY,
        record_type TEXT NOT NULL CHECK (record_type IN ('conversation', 'entry', 'task', 'submission', 'document'))
      )`,
      `CREATE TABLE ${tables.conversations} (
        id BIGINT PRIMARY KEY,
        owner_conversation_id BIGINT,
        owner_task_id BIGINT,
        record TEXT NOT NULL
      )`,
      `CREATE INDEX conversations_by_owner_conversation ON ${tables.conversations} (owner_conversation_id, id)`,
      `CREATE INDEX conversations_by_owner_task ON ${tables.conversations} (owner_task_id, id)`,
      `CREATE TABLE ${tables.entries} (
        id BIGINT PRIMARY KEY,
        conversation_id BIGINT NOT NULL,
        head BIGINT,
        commit_seq BIGINT NOT NULL,
        record TEXT NOT NULL
      )`,
      `CREATE INDEX entries_by_conversation ON ${tables.entries} (conversation_id, id DESC)`,
      `CREATE INDEX entry_heads_by_conversation ON ${tables.entries} (conversation_id, id DESC) WHERE head IS NOT NULL`,
      `CREATE TABLE ${tables.tasks} (
        id BIGINT PRIMARY KEY,
        conversation_id BIGINT NOT NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'waiting', 'sleeping', 'completing', 'terminal')),
        abort_requested BOOLEAN NOT NULL,
        background BOOLEAN NOT NULL,
        record TEXT NOT NULL
      )`,
      `CREATE INDEX tasks_by_status ON ${tables.tasks} (status, id)`,
      `CREATE INDEX tasks_by_conversation ON ${tables.tasks} (conversation_id, id)`,
      `CREATE INDEX tasks_by_kind ON ${tables.tasks} (kind, id)`,
      `CREATE INDEX tasks_by_abort_requested ON ${tables.tasks} (abort_requested, id)`,
      `CREATE INDEX tasks_by_background ON ${tables.tasks} (background, id)`,
      `CREATE TABLE ${tables.submissions} (
        id BIGINT PRIMARY KEY,
        conversation_id BIGINT NOT NULL,
        request_id TEXT,
        status TEXT NOT NULL CHECK (status IN ('queued', 'placed', 'done', 'unanswered')),
        record TEXT NOT NULL
      )`,
      `CREATE INDEX submissions_by_request ON ${tables.submissions} (conversation_id, request_id)`,
      `CREATE INDEX submissions_by_conversation ON ${tables.submissions} (conversation_id, id)`,
      `CREATE INDEX submissions_by_status ON ${tables.submissions} (status, id)`,
      `CREATE TABLE ${tables.documents} (
        id BIGINT PRIMARY KEY,
        kind TEXT NOT NULL,
        family BOOLEAN NOT NULL,
        key_value TEXT NOT NULL,
        scope_kind TEXT NOT NULL CHECK (scope_kind IN ('session', 'conversation', 'task')),
        owner_id BIGINT NOT NULL,
        created_at BIGINT NOT NULL,
        retired_at BIGINT,
        record TEXT NOT NULL
      )`,
      `CREATE INDEX documents_by_address
        ON ${tables.documents} (kind, scope_kind, owner_id, family, key_value, created_at DESC, retired_at)`,
      `CREATE INDEX documents_by_scope ON ${tables.documents} (scope_kind, owner_id, id)`,
      `CREATE INDEX documents_by_scope_kind ON ${tables.documents} (scope_kind, owner_id, kind, id)`,
      `CREATE TABLE ${tables.documentRevisions} (
        document_id BIGINT NOT NULL,
        seq BIGINT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('base', 'delta')),
        version INTEGER NOT NULL,
        content TEXT NOT NULL,
        PRIMARY KEY (document_id, seq)
      )`,
      `CREATE INDEX document_revisions_by_kind ON ${tables.documentRevisions} (document_id, kind, seq DESC)`,
    ],
  },
  {
    // Not in SQLite, whose storage has one process by construction: the token of the storage that owns the schema.
    version: 2,
    statements: [
      `ALTER TABLE ${tables.durableMetadata} ADD COLUMN owner_token TEXT`,
    ],
  },
];
