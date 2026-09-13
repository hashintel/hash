import { Pool } from "pg";
import { expect, test } from "vitest";

import { createPostgresRunnerFromPool } from "../../src/postgres.ts";
import {
  createPostgresWorkedModelStore,
  type WorkedModelFixture,
} from "../../src/worked-model-store.ts";

import type { SDCPN } from "@hashintel/petrinaut-core";

const connectionString = process.env.BRUNCH_TEST_POSTGRES_URL;

const emptyDefinition: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

const fixture = (
  fixtureVersion = "inventory-purchasing-v1",
): WorkedModelFixture => ({
  bundleKey: "inventory-purchasing",
  fixtureVersion,
  sourceManifestSha256: "f".repeat(64),
  title: "Inventory purchasing",
  session: {
    v: 1,
    conversationId: "fixture-source",
    offset: "fixture-offset",
    messages: [],
    settlements: [],
  },
  workpiece: "# Inventory purchasing\n",
  definition: emptyDefinition,
  revisionId: `${fixtureVersion}-revision`,
});

test.skipIf(connectionString === undefined)(
  "seeds and isolates worked-model net projections in real Postgres",
  async () => {
    const pool = new Pool({ connectionString });
    const runner = createPostgresRunnerFromPool(pool);
    let nextId = 0;
    const store = createPostgresWorkedModelStore(
      runner,
      () => `postgres-id-${nextId++}`,
    );
    try {
      await runner.query("DROP TABLE IF EXISTS brunch_worked_model_copies");
      await runner.query("DROP TABLE IF EXISTS brunch_worked_model_fixtures");

      await store.seed([fixture()]);
      await store.seed([fixture()]);
      const first = await store.resolveNetProjection({
        bundleKey: "inventory-purchasing",
        principalKey: "principal-a",
      });
      const resumed = await store.resolveNetProjection({
        bundleKey: "inventory-purchasing",
        principalKey: "principal-a",
      });
      const sibling = await store.resolveNetProjection({
        bundleKey: "inventory-purchasing",
        principalKey: "principal-b",
      });
      if (first === undefined || sibling === undefined)
        throw new Error("Expected seeded net projections");

      const changedDefinition: SDCPN = {
        ...emptyDefinition,
        places: [
          {
            id: "on-hand",
            name: "On hand",
            x: 0,
            y: 0,
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
          },
        ],
      };
      const changed = await store.updateNetProjectionDefinition({
        copyId: first.copyId,
        principalKey: "principal-a",
        expectedSha256: first.definitionSha256,
        expectedRevisionId: first.revisionId,
        definition: changedDefinition,
        revisionId: "changed-revision",
      });
      const clean = await store.createCleanNetProjection({
        bundleKey: "inventory-purchasing",
        principalKey: "principal-a",
      });
      await store.seed([fixture("inventory-purchasing-v2")]);
      const newer = await store.resolveNetProjection({
        bundleKey: "inventory-purchasing",
        principalKey: "principal-c",
      });
      const siblingAfter = await store.resolveNetProjection({
        bundleKey: "inventory-purchasing",
        principalKey: "principal-b",
      });

      expect(resumed).toEqual(first);
      expect(sibling.copyId).not.toBe(first.copyId);
      expect(changed?.definition).toMatchObject(changedDefinition);
      expect(changed?.revisionId).toBe("changed-revision");
      expect(clean?.definition).toMatchObject(emptyDefinition);
      expect(clean?.copyId).not.toBe(first.copyId);
      expect(siblingAfter).toEqual(sibling);
      expect(siblingAfter?.definition).toMatchObject(emptyDefinition);
      expect(newer?.fixtureVersion).toBe("inventory-purchasing-v2");
      expect(
        await runner.query(
          "SELECT COUNT(*)::int AS count FROM brunch_worked_model_fixtures",
        ),
      ).toEqual([{ count: 1 }]);
      expect(
        await runner.query(
          "SELECT COUNT(*)::int AS count FROM brunch_worked_model_copies",
        ),
      ).toEqual([{ count: 4 }]);
    } finally {
      await runner.query("DROP TABLE IF EXISTS brunch_worked_model_copies");
      await runner.query("DROP TABLE IF EXISTS brunch_worked_model_fixtures");
      await runner.close();
    }
  },
);
