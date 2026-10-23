import { randomUUID } from "node:crypto";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { registerStorageConformance } from "@earendil-works/pi-durable/testing";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { postgresConfigFromEnvironment } from "./postgres-config";
import { openPostgresStorage } from "./postgres-storage";

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
