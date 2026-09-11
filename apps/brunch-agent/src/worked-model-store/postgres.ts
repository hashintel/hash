import { randomUUID } from "node:crypto";

import type {
  WorkedModelCopy,
  WorkedModelFixture,
  WorkedModelStore,
} from "../worked-model-store.ts";
import type { PostgresRunner } from "@flue/postgres";

type Query = PostgresRunner["query"];

const stringField = (row: Record<string, unknown>, name: string): string => {
  const value = row[name];
  if (typeof value !== "string")
    throw new Error(`Worked-model database row has no ${name}.`);
  return value;
};

const jsonField = (
  row: Record<string, unknown>,
  name: string,
): Record<string, unknown> => {
  const raw = row[name];
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`Worked-model database row has invalid ${name}.`);
  return value as Record<string, unknown>;
};

const copyFromRow = (row: Record<string, unknown>): WorkedModelCopy => ({
  bundleKey: stringField(row, "bundleKey"),
  copyId: stringField(row, "copyId"),
  conversationId: stringField(row, "conversationId"),
  documentId: stringField(row, "documentId"),
  incarnationId: stringField(row, "incarnationId"),
  fixtureVersion: stringField(row, "fixtureVersion"),
  principalKey: stringField(row, "principalKey"),
  title: stringField(row, "title"),
  definition: jsonField(row, "definition") as WorkedModelCopy["definition"],
  definitionSha256: stringField(row, "definitionSha256"),
});

const copySelection = `
  SELECT
    bundle_key AS "bundleKey",
    copy_id AS "copyId",
    conversation_id AS "conversationId",
    document_id AS "documentId",
    incarnation_id AS "incarnationId",
    fixture_version AS "fixtureVersion",
    principal_key AS "principalKey",
    title,
    definition AS "definition",
    definition_sha256 AS "definitionSha256"
  FROM brunch_worked_model_copies
`;

const createTables = async (query: Query): Promise<void> => {
  await query(`
    CREATE TABLE IF NOT EXISTS brunch_worked_model_fixtures (
      bundle_key TEXT PRIMARY KEY,
      fixture_version TEXT NOT NULL,
      fixture_sha256 TEXT NOT NULL,
      fixture JSONB NOT NULL
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS brunch_worked_model_copies (
      copy_id TEXT PRIMARY KEY,
      bundle_key TEXT NOT NULL,
      fixture_version TEXT NOT NULL,
      principal_key TEXT NOT NULL,
      conversation_id TEXT NOT NULL UNIQUE,
      document_id TEXT NOT NULL UNIQUE,
      incarnation_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      seed_fixture JSONB NOT NULL,
      definition JSONB NOT NULL,
      definition_sha256 TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE
    )
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS brunch_worked_model_active_copy
    ON brunch_worked_model_copies (principal_key, bundle_key)
    WHERE active
  `);
};

const fixtureFromRow = (row: Record<string, unknown>): WorkedModelFixture =>
  jsonField(row, "fixture") as unknown as WorkedModelFixture;

export const createPostgresWorkedModelStore = (
  runner: PostgresRunner,
  fixtureSha256: (fixture: WorkedModelFixture) => string,
  definitionSha256: (definition: WorkedModelCopy["definition"]) => string,
  createId: () => string = randomUUID,
): WorkedModelStore => {
  let migration: Promise<void> | undefined;
  const ensureTables = (): Promise<void> =>
    (migration ??= createTables(runner.query));

  const instantiate = (
    fixture: WorkedModelFixture,
    principalKey: string,
  ): WorkedModelCopy => {
    const definition = structuredClone(fixture.definition);
    return {
      bundleKey: fixture.bundleKey,
      copyId: createId(),
      conversationId: createId(),
      documentId: createId(),
      incarnationId: createId(),
      fixtureVersion: fixture.fixtureVersion,
      principalKey,
      title: fixture.title,
      definition,
      definitionSha256: definitionSha256(definition),
    };
  };

  const insertCopy = async (
    query: Query,
    copy: WorkedModelCopy,
    fixture: WorkedModelFixture,
    onConflict = "",
  ): Promise<WorkedModelCopy | undefined> => {
    const rows = await query(
      `
        INSERT INTO brunch_worked_model_copies (
          copy_id,
          bundle_key,
          fixture_version,
          principal_key,
          conversation_id,
          document_id,
          incarnation_id,
          title,
          seed_fixture,
          definition,
          definition_sha256,
          active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, TRUE)
        ${onConflict}
        RETURNING
          bundle_key AS "bundleKey",
          copy_id AS "copyId",
          conversation_id AS "conversationId",
          document_id AS "documentId",
          incarnation_id AS "incarnationId",
          fixture_version AS "fixtureVersion",
          principal_key AS "principalKey",
          title,
          definition AS "definition",
          definition_sha256 AS "definitionSha256"
      `,
      [
        copy.copyId,
        copy.bundleKey,
        copy.fixtureVersion,
        copy.principalKey,
        copy.conversationId,
        copy.documentId,
        copy.incarnationId,
        copy.title,
        JSON.stringify(fixture),
        JSON.stringify(copy.definition),
        copy.definitionSha256,
      ],
    );
    const row = rows[0];
    return row === undefined ? undefined : copyFromRow(row);
  };

  const currentFixture = async (
    query: Query,
    bundleKey: string,
  ): Promise<WorkedModelFixture | undefined> => {
    const rows = await query(
      `
        SELECT fixture
        FROM brunch_worked_model_fixtures
        WHERE bundle_key = $1
      `,
      [bundleKey],
    );
    const row = rows[0];
    return row === undefined ? undefined : fixtureFromRow(row);
  };

  return {
    seed: async (fixtures) => {
      await ensureTables();
      await runner.transaction(async ({ query }) => {
        for (const fixture of fixtures) {
          // eslint-disable-next-line no-await-in-loop -- Seed order is deterministic and one transaction is the boundary.
          const existingRows = await query(
            `
              SELECT
                fixture_version AS "fixtureVersion",
                fixture_sha256 AS "fixtureSha256"
              FROM brunch_worked_model_fixtures
              WHERE bundle_key = $1
              FOR UPDATE
            `,
            [fixture.bundleKey],
          );
          const existing = existingRows[0];
          const sha256 = fixtureSha256(fixture);
          if (
            existing !== undefined &&
            stringField(existing, "fixtureVersion") ===
              fixture.fixtureVersion &&
            stringField(existing, "fixtureSha256") !== sha256
          )
            throw new Error(
              `Worked-model fixture ${fixture.bundleKey}@${fixture.fixtureVersion} changed without a version change.`,
            );
          if (
            existing === undefined ||
            stringField(existing, "fixtureVersion") !== fixture.fixtureVersion
          )
            // eslint-disable-next-line no-await-in-loop -- Seed order is deterministic and one transaction is the boundary.
            await query(
              `
                INSERT INTO brunch_worked_model_fixtures (
                  bundle_key,
                  fixture_version,
                  fixture_sha256,
                  fixture
                )
                VALUES ($1, $2, $3, $4::jsonb)
                ON CONFLICT (bundle_key) DO UPDATE SET
                  fixture_version = EXCLUDED.fixture_version,
                  fixture_sha256 = EXCLUDED.fixture_sha256,
                  fixture = EXCLUDED.fixture
              `,
              [
                fixture.bundleKey,
                fixture.fixtureVersion,
                sha256,
                JSON.stringify(fixture),
              ],
            );
        }
      });
    },
    resolveCopy: async ({ bundleKey, principalKey }) => {
      await ensureTables();
      return runner.transaction(async ({ query }) => {
        const existingRows = await query(
          `${copySelection}
           WHERE principal_key = $1 AND bundle_key = $2 AND active
           LIMIT 1
           FOR UPDATE`,
          [principalKey, bundleKey],
        );
        const existing = existingRows[0];
        if (existing !== undefined) return copyFromRow(existing);
        const fixture = await currentFixture(query, bundleKey);
        if (fixture === undefined) return undefined;
        const inserted = await insertCopy(
          query,
          instantiate(fixture, principalKey),
          fixture,
          `ON CONFLICT (principal_key, bundle_key) WHERE active DO NOTHING`,
        );
        if (inserted !== undefined) return inserted;
        const racedRows = await query(
          `${copySelection}
           WHERE principal_key = $1 AND bundle_key = $2 AND active
           LIMIT 1`,
          [principalKey, bundleKey],
        );
        const raced = racedRows[0];
        return raced === undefined ? undefined : copyFromRow(raced);
      });
    },
    createCleanCopy: async ({ bundleKey, principalKey }) => {
      await ensureTables();
      return runner.transaction(async ({ query }) => {
        const fixture = await currentFixture(query, bundleKey);
        if (fixture === undefined) return undefined;
        await query(
          `
            UPDATE brunch_worked_model_copies
            SET active = FALSE
            WHERE principal_key = $1 AND bundle_key = $2 AND active
          `,
          [principalKey, bundleKey],
        );
        return insertCopy(query, instantiate(fixture, principalKey), fixture);
      });
    },
    updateCopyDefinition: async ({
      copyId,
      principalKey,
      expectedSha256,
      definition,
    }) => {
      await ensureTables();
      return runner.transaction(async ({ query }) => {
        const currentRows = await query(
          `${copySelection}
           WHERE copy_id = $1 AND principal_key = $2
           FOR UPDATE`,
          [copyId, principalKey],
        );
        const currentRow = currentRows[0];
        if (currentRow === undefined) return undefined;
        const current = copyFromRow(currentRow);
        if (current.definitionSha256 !== expectedSha256)
          throw new Error("Worked-model copy changed before this update.");
        const updatedRows = await query(
          `
            UPDATE brunch_worked_model_copies
            SET definition = $3::jsonb, definition_sha256 = $4
            WHERE copy_id = $1 AND principal_key = $2
            RETURNING
              bundle_key AS "bundleKey",
              copy_id AS "copyId",
              conversation_id AS "conversationId",
              document_id AS "documentId",
              incarnation_id AS "incarnationId",
              fixture_version AS "fixtureVersion",
              principal_key AS "principalKey",
              title,
              definition AS "definition",
              definition_sha256 AS "definitionSha256"
          `,
          [
            copyId,
            principalKey,
            JSON.stringify(definition),
            definitionSha256(definition),
          ],
        );
        const updated = updatedRows[0];
        return updated === undefined ? undefined : copyFromRow(updated);
      });
    },
  };
};
