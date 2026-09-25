import { expect, test } from "vitest";

import {
  definitionSha256,
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

export const workedModelFixture = (
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

const sequentialIds = () => {
  let next = 0;
  return () => `id-${next++}`;
};

/** Every store implementation must pass these against an empty backing store. */
export const workedModelStoreContract = (
  openStore: (createId: () => string) => Promise<WorkedModelStore>,
) => {
  const open = () => openStore(sequentialIds());

  test("seeds idempotently and refuses changed bytes under one version", async () => {
    const store = await open();
    await store.seed([workedModelFixture()]);
    await expect(store.seed([workedModelFixture()])).resolves.toBeUndefined();
    await expect(
      store.seed([
        { ...workedModelFixture(), title: "Changed without a new version" },
      ]),
    ).rejects.toThrow(/version change/u);
  });

  test("resumes one active net projection for a principal and isolates another principal", async () => {
    const store = await open();
    await store.seed([workedModelFixture()]);

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

    expect(resumed).toEqual(first);
    // This green oracle proves only the current net projection. Fixture
    // session/workpiece preservation remains in the bundle contract suite.
    expect(first).not.toHaveProperty("session");
    expect(first).not.toHaveProperty("workpiece");
    expect(sibling?.copyId).not.toBe(first?.copyId);
    expect(sibling?.conversationId).not.toBe(first?.conversationId);
    expect(sibling?.documentId).not.toBe(first?.documentId);
    expect(sibling?.incarnationId).not.toBe(first?.incarnationId);
  });

  test("creates a clean active net projection from the current seed without changing its sibling", async () => {
    const store = await open();
    await store.seed([workedModelFixture()]);
    const first = await store.resolveNetProjection({
      bundleKey: "inventory-purchasing",
      principalKey: "principal-a",
    });
    if (first === undefined) throw new Error("Missing first net projection");
    const sibling = await store.resolveNetProjection({
      bundleKey: "inventory-purchasing",
      principalKey: "principal-b",
    });
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
    const resumed = await store.resolveNetProjection({
      bundleKey: "inventory-purchasing",
      principalKey: "principal-a",
    });

    expect(changed?.definition).toMatchObject(changedDefinition);
    expect(changed?.revisionId).toBe("changed-revision");
    expect(clean?.copyId).not.toBe(first.copyId);
    expect(clean?.definition).toMatchObject(emptyDefinition);
    expect(clean?.definitionSha256).toBe(
      clean === undefined ? undefined : definitionSha256(clean.definition),
    );
    expect(resumed).toEqual(clean);
    await expect(
      store.resolveNetProjection({
        bundleKey: "inventory-purchasing",
        principalKey: "principal-b",
      }),
    ).resolves.toEqual(sibling);
  });

  test("keeps existing net projections on their fixture version when a new seed lands", async () => {
    const store = await open();
    await store.seed([workedModelFixture()]);
    const existing = await store.resolveNetProjection({
      bundleKey: "inventory-purchasing",
      principalKey: "principal-a",
    });
    await store.seed([workedModelFixture("inventory-purchasing-v2")]);
    const resumed = await store.resolveNetProjection({
      bundleKey: "inventory-purchasing",
      principalKey: "principal-a",
    });
    const clean = await store.createCleanNetProjection({
      bundleKey: "inventory-purchasing",
      principalKey: "principal-a",
    });

    expect(existing?.fixtureVersion).toBe("inventory-purchasing-v1");
    expect(resumed?.fixtureVersion).toBe("inventory-purchasing-v1");
    expect(clean?.fixtureVersion).toBe("inventory-purchasing-v2");
  });

  test("rejects stale or foreign updates without changing the active net projection", async () => {
    const store = await open();
    await store.seed([workedModelFixture()]);
    const netProjection = await store.resolveNetProjection({
      bundleKey: "inventory-purchasing",
      principalKey: "principal-a",
    });
    if (netProjection === undefined) throw new Error("Missing net projection");

    await expect(
      store.updateNetProjectionDefinition({
        copyId: netProjection.copyId,
        principalKey: "principal-a",
        expectedSha256: netProjection.definitionSha256,
        expectedRevisionId: netProjection.revisionId,
        definition: emptyDefinition,
        revisionId: netProjection.revisionId,
      }),
    ).rejects.toThrow(/did not advance/u);
    await expect(
      store.updateNetProjectionDefinition({
        copyId: netProjection.copyId,
        principalKey: "principal-a",
        expectedSha256: "0".repeat(64),
        expectedRevisionId: netProjection.revisionId,
        definition: emptyDefinition,
        revisionId: "rejected-hash-revision",
      }),
    ).rejects.toThrow(/changed before/u);
    await expect(
      store.updateNetProjectionDefinition({
        copyId: netProjection.copyId,
        principalKey: "principal-a",
        expectedSha256: netProjection.definitionSha256,
        expectedRevisionId: "stale-revision",
        definition: emptyDefinition,
        revisionId: "rejected-chain-revision",
      }),
    ).rejects.toThrow(/changed before/u);
    await expect(
      store.updateNetProjectionDefinition({
        copyId: netProjection.copyId,
        principalKey: "principal-b",
        expectedSha256: netProjection.definitionSha256,
        expectedRevisionId: netProjection.revisionId,
        definition: emptyDefinition,
        revisionId: "foreign-revision",
      }),
    ).resolves.toBeUndefined();
    await expect(
      store.resolveNetProjection({
        bundleKey: "inventory-purchasing",
        principalKey: "principal-a",
      }),
    ).resolves.toEqual(netProjection);
  });

  test("returns no net projection for an unknown bundle", async () => {
    const store = await open();
    await expect(
      store.resolveNetProjection({
        bundleKey: "unknown",
        principalKey: "principal-a",
      }),
    ).resolves.toBeUndefined();
  });
};
