import { Hono } from "hono";
import { beforeEach, describe, expect, test } from "vitest";

import { BRUNCH_PRINCIPAL_HEADER } from "@hashintel/brunch-agent-transport-aisdk/headers";

import { createWorkedModelRouter } from "../src/http/worked-models.ts";
import {
  createInMemoryWorkedModelStore,
  type WorkedModelFixture,
  type WorkedModelStore,
} from "../src/worked-model-store.ts";

import type { SDCPN } from "@hashintel/petrinaut-core";

const emptyDefinition: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

const fixture: WorkedModelFixture = {
  bundleKey: "inventory-purchasing",
  fixtureVersion: "inventory-purchasing-v1",
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
  revisionId: "fixture-revision",
};

const request = (
  path: string,
  principalKey?: string,
  init: RequestInit = {},
): Request =>
  new Request(`http://brunch.test${path}`, {
    ...init,
    headers: {
      ...(principalKey === undefined
        ? {}
        : { [BRUNCH_PRINCIPAL_HEADER]: principalKey }),
      ...init.headers,
    },
  });

describe("worked-model routes", () => {
  let app: Hono;
  let store: WorkedModelStore;

  beforeEach(async () => {
    let nextId = 0;
    store = createInMemoryWorkedModelStore(() => `id-${nextId++}`);
    await store.seed([fixture]);
    app = new Hono();
    app.route("/api/worked-models", createWorkedModelRouter(store));
  });

  test("requires a principal before resolving or creating copies", async () => {
    for (const [path, method] of [
      ["/api/worked-models/bundles/inventory-purchasing", "GET"],
      ["/api/worked-models/bundles/inventory-purchasing/copies", "POST"],
      ["/api/worked-models/copies/copy/definition", "PUT"],
    ] as const) {
      const response = await app.fetch(request(path, undefined, { method }));
      expect(response.status, `${method} ${path}`).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
    }
  });

  test("resolves the same active copy and creates a clean replacement", async () => {
    const path = "/api/worked-models/bundles/inventory-purchasing";
    const firstResponse = await app.fetch(request(path, "principal-a"));
    const resumedResponse = await app.fetch(request(path, "principal-a"));
    const cleanResponse = await app.fetch(
      request(`${path}/copies`, "principal-a", { method: "POST" }),
    );
    const afterCleanResponse = await app.fetch(request(path, "principal-a"));
    const first = (await firstResponse.json()) as { copyId: string };
    const resumed = (await resumedResponse.json()) as { copyId: string };
    const clean = (await cleanResponse.json()) as { copyId: string };
    const afterClean = (await afterCleanResponse.json()) as { copyId: string };

    expect(firstResponse.status).toBe(200);
    expect(resumed.copyId).toBe(first.copyId);
    expect(cleanResponse.status).toBe(201);
    expect(clean.copyId).not.toBe(first.copyId);
    expect(afterClean.copyId).toBe(clean.copyId);
  });

  test("persists a canonical definition with optimistic concurrency", async () => {
    const resolved = await app.fetch(
      request("/api/worked-models/bundles/inventory-purchasing", "principal-a"),
    );
    const copy = (await resolved.json()) as {
      copyId: string;
      definitionSha256: string;
      revisionId: string;
    };
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
    const updatePath = `/api/worked-models/copies/${copy.copyId}/definition`;
    const unchangedRevision = await app.fetch(
      request(updatePath, "principal-a", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedSha256: copy.definitionSha256,
          expectedRevisionId: copy.revisionId,
          definition: changedDefinition,
          revisionId: copy.revisionId,
        }),
      }),
    );
    const update = await app.fetch(
      request(updatePath, "principal-a", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedSha256: copy.definitionSha256,
          expectedRevisionId: copy.revisionId,
          definition: changedDefinition,
          revisionId: "changed-revision",
        }),
      }),
    );
    const updated = (await update.json()) as {
      definition: SDCPN;
      definitionSha256: string;
      revisionId: string;
    };
    const stale = await app.fetch(
      request(updatePath, "principal-a", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedSha256: copy.definitionSha256,
          expectedRevisionId: copy.revisionId,
          definition: emptyDefinition,
          revisionId: "stale-revision",
        }),
      }),
    );

    expect(unchangedRevision.status).toBe(400);
    expect(await unchangedRevision.json()).toEqual({
      error: "invalid-definition-update",
    });
    expect(update.status).toBe(200);
    expect(updated.definition).toMatchObject(changedDefinition);
    expect(updated.definitionSha256).not.toBe(copy.definitionSha256);
    expect(updated.revisionId).toBe("changed-revision");
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: "stale-copy" });
  });

  test("keeps copies isolated by principal", async () => {
    const path = "/api/worked-models/bundles/inventory-purchasing";
    const first = (await (
      await app.fetch(request(path, "principal-a"))
    ).json()) as { copyId: string; conversationId: string };
    const sibling = (await (
      await app.fetch(request(path, "principal-b"))
    ).json()) as { copyId: string; conversationId: string };

    expect(sibling.copyId).not.toBe(first.copyId);
    expect(sibling.conversationId).not.toBe(first.conversationId);
  });

  test("distinguishes invalid and unknown bundle keys", async () => {
    const invalid = await app.fetch(
      request("/api/worked-models/bundles/Inventory_Purchasing", "principal-a"),
    );
    const unknown = await app.fetch(
      request("/api/worked-models/bundles/unknown", "principal-a"),
    );

    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: "invalid-bundle-key" });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "bundle-not-found" });
  });
});
