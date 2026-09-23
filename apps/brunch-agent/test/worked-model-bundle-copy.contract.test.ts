import { Hono } from "hono";
import { Pool } from "pg";
import { describe, expect, test } from "vitest";

import { BRUNCH_PRINCIPAL_HEADER } from "@hashintel/brunch-agent-transport-aisdk/headers";

import { createWorkedModelNetProjectionRouter } from "../src/http/worked-models.ts";
import { createPostgresRunnerFromPool } from "../src/postgres.ts";
import { standardWorkedModelFixtures } from "../src/standard-worked-model-fixtures.ts";
import {
  createInMemoryWorkedModelStore,
  createPostgresWorkedModelStore,
  type WorkedModelFixture,
} from "../src/worked-model-store.ts";

import type { FlueConversationSnapshot } from "@flue/sdk";
import type { SDCPN } from "@hashintel/petrinaut-core";

const inventoryDefinition: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

const retainedSession: FlueConversationSnapshot = {
  v: 1,
  conversationId: "fixture-conversation",
  offset: "fixture-offset",
  settlements: [],
  messages: [
    {
      id: "fixture-turn",
      role: "system",
      purpose: "dispatch",
      display: "hidden",
      signal: { tagName: "fixture-provenance" },
      parts: [
        {
          type: "text",
          state: "done",
          text: "The receiving place came from the purchasing requirement.",
        },
      ],
    },
  ],
};

const fixture: WorkedModelFixture = {
  bundleKey: "inventory-purchasing",
  fixtureVersion: "inventory-purchasing-v1",
  sourceManifestSha256: "f".repeat(64),
  title: "Inventory purchasing",
  session: retainedSession,
  workpiece: "# Inventory purchasing\n\nReceiving is required.",
  definition: inventoryDefinition,
  revisionId: "fixture-document-revision",
};

const createSeededStore = async () => {
  let nextId = 0;
  const store = createInMemoryWorkedModelStore(() => `bundle-pin-${nextId++}`);
  await store.seed([fixture]);
  return store;
};

const recordFrom = (value: unknown): Record<string, unknown> => {
  expect(value).toBeDefined();
  expect(typeof value).toBe("object");
  expect(value).not.toBeNull();
  return value as Record<string, unknown>;
};

/**
 * Mission fog item: "Seeded session/workpiece fork".
 *
 * These expected failures are executable acceptance debt. Each one reaches the
 * current net-projection boundary, then fails on the named missing bundle
 * capability. An unexpected pass means the capability changed and the pin must
 * become an ordinary acceptance test before this suite can report completion.
 */
describe("complete worked-model bundle copy acceptance debt", () => {
  test.fails("EXPECTED FAILURE — resolution exposes retained fixture session and workpiece before a new turn", async () => {
    const store = await createSeededStore();
    const bundle = recordFrom(
      await store.resolveNetProjection({
        bundleKey: fixture.bundleKey,
        principalKey: "principal-a",
      }),
    );

    expect(bundle.session).toEqual(fixture.session);
    expect(bundle.workpiece).toBe(fixture.workpiece);
  });

  test.fails("EXPECTED FAILURE — copied provenance remaps workpiece passages to retained conversation turns", async () => {
    const store = await createSeededStore();
    const bundle = recordFrom(
      await store.resolveNetProjection({
        bundleKey: fixture.bundleKey,
        principalKey: "principal-a",
      }),
    );

    const provenance = recordFrom(bundle.provenance);
    expect(provenance.sourceConversationId).toBe(
      fixture.session.conversationId,
    );
    expect(typeof provenance.sourceWorkpieceRevisionId).toBe("string");
    expect(typeof provenance.remappedConversationId).toBe("string");
    expect(typeof provenance.remappedWorkpieceRevisionId).toBe("string");
  });

  test.fails("EXPECTED FAILURE — reopening one identity preserves its retained session/workpiece/net bundle", async () => {
    const store = await createSeededStore();
    const first = recordFrom(
      await store.resolveNetProjection({
        bundleKey: fixture.bundleKey,
        principalKey: "principal-a",
      }),
    );
    const reopened = recordFrom(
      await store.resolveNetProjection({
        bundleKey: fixture.bundleKey,
        principalKey: "principal-a",
      }),
    );

    expect(first).toHaveProperty("session");
    expect(first).toHaveProperty("workpiece");
    expect(reopened.session).toEqual(first.session);
    expect(reopened.workpiece).toEqual(first.workpiece);
    expect(reopened.definition).toEqual(first.definition);
  });

  test.fails("EXPECTED FAILURE — a clean copy resets session/workpiece/net together and remains isolated", async () => {
    const store = await createSeededStore();
    const first = recordFrom(
      await store.resolveNetProjection({
        bundleKey: fixture.bundleKey,
        principalKey: "principal-a",
      }),
    );
    const clean = recordFrom(
      await store.createCleanNetProjection({
        bundleKey: fixture.bundleKey,
        principalKey: "principal-a",
      }),
    );
    const sibling = recordFrom(
      await store.resolveNetProjection({
        bundleKey: fixture.bundleKey,
        principalKey: "principal-b",
      }),
    );

    expect(clean.copyId).not.toBe(first.copyId);
    expect(clean.session).toEqual(fixture.session);
    expect(clean.workpiece).toBe(fixture.workpiece);
    expect(clean.definition).toEqual(fixture.definition);
    expect(sibling.copyId).not.toBe(clean.copyId);
    expect(sibling.session).toEqual(fixture.session);
    expect(sibling.workpiece).toBe(fixture.workpiece);
  });

  test.fails("EXPECTED FAILURE — build-discovered Inventory reaches the product route through Postgres", async () => {
    expect(
      standardWorkedModelFixtures.some(
        (candidate) => candidate.bundleKey === fixture.bundleKey,
      ),
      "The reviewed Inventory artifact must be build-discovered.",
    ).toBe(true);
    const connectionString = process.env.BRUNCH_TEST_POSTGRES_URL;
    expect(
      connectionString,
      "The dedicated Postgres acceptance environment is required after build discovery is present.",
    ).toBeDefined();
    if (connectionString === undefined)
      throw new Error("Missing dedicated Postgres acceptance environment.");

    const runner = createPostgresRunnerFromPool(new Pool({ connectionString }));
    try {
      await runner.query("DROP TABLE IF EXISTS brunch_worked_model_copies");
      await runner.query("DROP TABLE IF EXISTS brunch_worked_model_fixtures");
      const store = createPostgresWorkedModelStore(runner);
      await store.seed(standardWorkedModelFixtures);
      const app = new Hono();
      app.route(
        "/api/worked-models",
        createWorkedModelNetProjectionRouter(store),
      );
      const response = await app.fetch(
        new Request(
          "http://brunch.test/api/worked-models/bundles/inventory-purchasing",
          {
            headers: { [BRUNCH_PRINCIPAL_HEADER]: "principal-a" },
          },
        ),
      );
      const bundle = recordFrom(await response.json());

      expect(response.status).toBe(200);
      expect(bundle.session).toBeDefined();
      expect(bundle.workpiece).toBeDefined();
    } finally {
      await runner.query("DROP TABLE IF EXISTS brunch_worked_model_copies");
      await runner.query("DROP TABLE IF EXISTS brunch_worked_model_fixtures");
      await runner.close();
    }
  });
});
