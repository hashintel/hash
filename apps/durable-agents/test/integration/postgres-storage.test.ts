import { randomUUID } from "node:crypto";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { registerStorageConformance } from "@earendil-works/pi-durable/testing";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { postgresConfigFromEnvironment } from "../../src/storage/postgres/postgres-config";
import { openPostgresStorage } from "../../src/storage/postgres/postgres-storage";

const poolConfig = postgresConfigFromEnvironment();
const admin = new Pool({ ...poolConfig, max: 1 });

afterAll(() => admin.end());

// Every case gets a fresh schema, dropped after it, so cases share nothing but the server.
registerStorageConformance(
  { describe, expect, it },
  "PostgresStorage",
  async (use) => {
    const schema = `pi_durable_test_${randomUUID().replaceAll("-", "")}`;
    const storage = await openPostgresStorage({ pool: poolConfig, schema });
    try {
      await use(storage);
    } finally {
      await storage.close(BACKGROUND_CONTEXT);
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
  },
);

describe("PostgresStorage.isOwner", () => {
  it("throws when the metadata row is missing, as commit and open do", async () => {
    const schema = `pi_durable_test_${randomUUID().replaceAll("-", "")}`;
    const storage = await openPostgresStorage({ pool: poolConfig, schema });
    try {
      expect(await storage.isOwner()).toBe(true);
      await admin.query(`DELETE FROM "${schema}".durable_metadata`);
      await expect(storage.isOwner()).rejects.toThrow(
        "Durable Postgres metadata is missing",
      );
    } finally {
      await storage.close(BACKGROUND_CONTEXT);
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
  });
});
