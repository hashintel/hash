import { randomUUID } from "node:crypto";

import {
  parseWorkedModelDefinition,
  parseWorkedModelNetProjection,
  type WorkedModelNetProjection,
} from "@hashintel/brunch-agent-plugin-sdcpn/worked-model";

import { isRetainedFixtureSession } from "./retained-fixture-session.ts";

import type {
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
  const value: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`Worked-model database row has invalid ${name}.`);
  return value as Record<string, unknown>;
};

const netProjectionFromRow = (
  row: Record<string, unknown>,
): WorkedModelNetProjection =>
  parseWorkedModelNetProjection({
    ...row,
    definition: jsonField(row, "definition"),
  });

const netProjectionSelection = `
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
    definition_sha256 AS "definitionSha256",
    revision_id AS "revisionId"
  -- Compatibility table name: rows currently store incomplete net projections.
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
  // Compatibility table name: this currently persists incomplete net projections.
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
      revision_id TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE
    )
  `);
  await query(`
    ALTER TABLE brunch_worked_model_copies
    ADD COLUMN IF NOT EXISTS revision_id TEXT
  `);
  await query(`
    UPDATE brunch_worked_model_copies
    SET revision_id = incarnation_id
    WHERE revision_id IS NULL
  `);
  await query(`
    ALTER TABLE brunch_worked_model_copies
    ALTER COLUMN revision_id SET NOT NULL
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS brunch_worked_model_active_copy
    ON brunch_worked_model_copies (principal_key, bundle_key)
    WHERE active
  `);
};

const fixtureFromRow = (row: Record<string, unknown>): WorkedModelFixture => {
  const fixture = jsonField(row, "fixture");
  const session = fixture.session;
  if (!isRetainedFixtureSession(session))
    throw new Error(
      "Worked-model database row has an invalid fixture session.",
    );
  return {
    bundleKey: stringField(fixture, "bundleKey"),
    fixtureVersion: stringField(fixture, "fixtureVersion"),
    sourceManifestSha256: stringField(fixture, "sourceManifestSha256"),
    title: stringField(fixture, "title"),
    session,
    workpiece: stringField(fixture, "workpiece"),
    definition: parseWorkedModelDefinition(fixture.definition),
    revisionId: stringField(fixture, "revisionId"),
  };
};

export const createPostgresWorkedModelStore = (
  runner: PostgresRunner,
  fixtureSha256: (fixture: WorkedModelFixture) => string,
  definitionSha256: (
    definition: WorkedModelNetProjection["definition"],
  ) => string,
  createId: () => string = randomUUID,
): WorkedModelStore => {
  let migration: Promise<void> | undefined;
  const ensureTables = (): Promise<void> => {
    migration ??= createTables(runner.query);
    return migration;
  };

  const instantiate = (
    fixture: WorkedModelFixture,
    principalKey: string,
  ): WorkedModelNetProjection => {
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
      revisionId: fixture.revisionId,
    };
  };

  const insertNetProjection = async (
    query: Query,
    netProjection: WorkedModelNetProjection,
    fixture: WorkedModelFixture,
    onConflict = "",
  ): Promise<WorkedModelNetProjection | undefined> => {
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
          revision_id,
          active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, TRUE)
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
          definition_sha256 AS "definitionSha256",
          revision_id AS "revisionId"
      `,
      [
        netProjection.copyId,
        netProjection.bundleKey,
        netProjection.fixtureVersion,
        netProjection.principalKey,
        netProjection.conversationId,
        netProjection.documentId,
        netProjection.incarnationId,
        netProjection.title,
        JSON.stringify(fixture),
        JSON.stringify(netProjection.definition),
        netProjection.definitionSha256,
        netProjection.revisionId,
      ],
    );
    const row = rows[0];
    return row === undefined ? undefined : netProjectionFromRow(row);
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
    resolveNetProjection: async ({ bundleKey, principalKey }) => {
      await ensureTables();
      return runner.transaction(async ({ query }) => {
        const existingRows = await query(
          `${netProjectionSelection}
           WHERE principal_key = $1 AND bundle_key = $2 AND active
           LIMIT 1
           FOR UPDATE`,
          [principalKey, bundleKey],
        );
        const existing = existingRows[0];
        if (existing !== undefined) return netProjectionFromRow(existing);
        const fixture = await currentFixture(query, bundleKey);
        if (fixture === undefined) return undefined;
        const inserted = await insertNetProjection(
          query,
          instantiate(fixture, principalKey),
          fixture,
          `ON CONFLICT (principal_key, bundle_key) WHERE active DO NOTHING`,
        );
        if (inserted !== undefined) return inserted;
        const racedRows = await query(
          `${netProjectionSelection}
           WHERE principal_key = $1 AND bundle_key = $2 AND active
           LIMIT 1`,
          [principalKey, bundleKey],
        );
        const raced = racedRows[0];
        return raced === undefined ? undefined : netProjectionFromRow(raced);
      });
    },
    createCleanNetProjection: async ({ bundleKey, principalKey }) => {
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
        return insertNetProjection(
          query,
          instantiate(fixture, principalKey),
          fixture,
        );
      });
    },
    updateNetProjectionDefinition: async ({
      copyId,
      principalKey,
      expectedSha256,
      expectedRevisionId,
      definition,
      revisionId,
    }) => {
      if (revisionId === expectedRevisionId)
        throw new Error(
          "Worked-model net projection revision did not advance.",
        );
      await ensureTables();
      return runner.transaction(async ({ query }) => {
        const currentRows = await query(
          `${netProjectionSelection}
           WHERE copy_id = $1 AND principal_key = $2
           FOR UPDATE`,
          [copyId, principalKey],
        );
        const currentRow = currentRows[0];
        if (currentRow === undefined) return undefined;
        const current = netProjectionFromRow(currentRow);
        if (
          current.definitionSha256 !== expectedSha256 ||
          current.revisionId !== expectedRevisionId
        )
          throw new Error(
            "Worked-model net projection changed before this update.",
          );
        const updatedRows = await query(
          `
            UPDATE brunch_worked_model_copies
            SET definition = $3::jsonb, definition_sha256 = $4, revision_id = $5
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
              definition_sha256 AS "definitionSha256",
              revision_id AS "revisionId"
          `,
          [
            copyId,
            principalKey,
            JSON.stringify(definition),
            definitionSha256(definition),
            revisionId,
          ],
        );
        const updated = updatedRows[0];
        return updated === undefined
          ? undefined
          : netProjectionFromRow(updated);
      });
    },
  };
};
