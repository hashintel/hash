// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from "vitest";

import { entityIdFromComponents } from "@blockprotocol/type-system";

import { decodeEntityId, ID_HEADER_BYTES } from "../entity-id-codec";
import { EntityStore } from "./entity-store";

import type { EntityUuid, WebId } from "@blockprotocol/type-system";

const webId = "11111111-1111-4111-8111-111111111111" as WebId;

const entityIdFor = (index: number) =>
  entityIdFromComponents(
    webId,
    `22222222-2222-4222-8222-${index.toString(16).padStart(12, "0")}` as EntityUuid,
  );

/** Decode the EntityId the store recorded for `idx`, reading its join-map SAB directly
 * (the same on-demand read the main thread does). */
const readMappedId = (store: EntityStore, idx: number) =>
  decodeEntityId(new Uint8Array(store.entityIdMap.raw, ID_HEADER_BYTES), idx);

describe("EntityStore join map", () => {
  it("writes each EntityId into the map the instant it is interned", () => {
    const store = new EntityStore();
    const idA = entityIdFor(1);
    const idB = entityIdFor(2);

    const [createdA, idxA] = store.tryInsert(idA);
    const [createdB, idxB] = store.tryInsert(idB);

    expect(createdA).toBe(true);
    expect(createdB).toBe(true);
    expect(idxB).toBe(idxA + 1);
    expect(readMappedId(store, idxA)).toBe(idA);
    expect(readMappedId(store, idxB)).toBe(idB);
  });

  it("re-interning an EntityId returns the same idx, map untouched", () => {
    const store = new EntityStore();
    const idA = entityIdFor(1);
    const [, idx] = store.tryInsert(idA);

    const [createdAgain, idxAgain] = store.tryInsert(idA);

    expect(createdAgain).toBe(false);
    expect(idxAgain).toBe(idx);
    expect(readMappedId(store, idx)).toBe(idA);
  });

  it("grows the map past its initial capacity, preserving earlier entries", () => {
    const store = new EntityStore();
    const first = entityIdFor(0);
    store.tryInsert(first);

    // Exceed the initial capacity (4096) so the map grows at least once.
    let lastId = first;
    let lastIdx = 0;
    for (let index = 1; index <= 5000; index++) {
      lastId = entityIdFor(index);
      const [, idx] = store.tryInsert(lastId);
      lastIdx = idx;
    }

    expect(store.size).toBe(5001);
    expect(store.entityIdMap.capacity).toBeGreaterThanOrEqual(5001);
    expect(readMappedId(store, 0)).toBe(first); // survived the grow(s)
    expect(readMappedId(store, lastIdx)).toBe(lastId);
  });
});

describe("EntityStore roots", () => {
  it("treats a freshly-interned entity as a frontier node (not a root)", () => {
    const store = new EntityStore();
    const [, idx] = store.tryInsert(entityIdFor(1));
    expect(store.isRoot(idx)).toBe(false);
  });

  it("promotes an entity to a root, reporting the flip only once", () => {
    const store = new EntityStore();
    const [, idx] = store.tryInsert(entityIdFor(1));

    expect(store.setRoot(idx)).toBe(true);
    expect(store.isRoot(idx)).toBe(true);
    // Idempotent: promoting an existing root reports no flip and stays a root.
    expect(store.setRoot(idx)).toBe(false);
    expect(store.isRoot(idx)).toBe(true);
  });

  it("tracks root-ness independently per entity, including past the initial capacity", () => {
    const store = new EntityStore();
    const [, idxA] = store.tryInsert(entityIdFor(1));

    // Intern well past the initial capacity (4096) so the root bitset has to grow.
    let highIdx = idxA;
    for (let index = 2; index <= 5000; index++) {
      const [, idx] = store.tryInsert(entityIdFor(index));
      highIdx = idx;
    }

    expect(store.setRoot(highIdx)).toBe(true);
    expect(store.isRoot(highIdx)).toBe(true);
    expect(store.isRoot(idxA)).toBe(false);
  });
});
