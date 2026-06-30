// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from "vitest";

import { entityIdFromComponents } from "@blockprotocol/type-system";

import { EntityIdBuffer } from "./entity-id-buffer";

import type { DraftId, EntityUuid, WebId } from "@blockprotocol/type-system";

const webIdA = "11111111-1111-4111-8111-111111111111" as WebId;
const entityUuidA = "22222222-2222-4222-8222-222222222222" as EntityUuid;
const webIdB = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" as WebId;
const entityUuidB = "12345678-90ab-4cde-8f01-234567890abc" as EntityUuid;
const draftId = "33333333-3333-4333-8333-333333333333" as DraftId;

describe("EntityIdBuffer", () => {
  it("round-trips a non-draft EntityId", () => {
    const buffer = new EntityIdBuffer(4);
    const id = entityIdFromComponents(webIdA, entityUuidA);
    buffer.setId(2, id);
    expect(buffer.readId(2)).toBe(id);
  });

  it("round-trips a draft EntityId (draftId slot used)", () => {
    const buffer = new EntityIdBuffer(4);
    const id = entityIdFromComponents(webIdA, entityUuidA, draftId);
    buffer.setId(0, id);
    expect(buffer.readId(0)).toBe(id);
  });

  it("keeps entries independent by EntityIdx", () => {
    const buffer = new EntityIdBuffer(8);
    const first = entityIdFromComponents(webIdA, entityUuidA);
    const second = entityIdFromComponents(webIdB, entityUuidB);
    buffer.setId(0, first);
    buffer.setId(7, second);
    expect(buffer.readId(0)).toBe(first);
    expect(buffer.readId(7)).toBe(second);
  });

  it("overwriting an EntityIdx with a non-draft id clears a prior draftId", () => {
    const buffer = new EntityIdBuffer(2);
    buffer.setId(1, entityIdFromComponents(webIdA, entityUuidA, draftId));
    const plain = entityIdFromComponents(webIdB, entityUuidB);
    buffer.setId(1, plain);
    expect(buffer.readId(1)).toBe(plain);
  });

  it("grows in place to fit a higher EntityIdx, preserving earlier entries", () => {
    const buffer = new EntityIdBuffer(2, undefined, 8);
    const first = entityIdFromComponents(webIdA, entityUuidA);
    buffer.setId(0, first);
    expect(buffer.capacity).toBe(2);

    buffer.ensureCapacity(6); // within maxCapacity 8 → grows in place, no re-publish
    expect(buffer.capacity).toBeGreaterThanOrEqual(6);

    const later = entityIdFromComponents(webIdB, entityUuidB);
    buffer.setId(5, later); // beyond the original capacity, within the grown one
    expect(buffer.readId(5)).toBe(later);
    expect(buffer.readId(0)).toBe(first); // earlier entry survived the grow
  });

  it("re-allocates + re-publishes past maxCapacity, copying existing entries", () => {
    let republished: SharedArrayBuffer | ArrayBuffer | null = null;
    const onRepublish = (raw: SharedArrayBuffer | ArrayBuffer) => {
      republished = raw;
    };
    const buffer = new EntityIdBuffer(2, onRepublish, 4);
    const first = entityIdFromComponents(webIdA, entityUuidA);
    buffer.setId(0, first);

    buffer.ensureCapacity(10); // past maxCapacity 4 → re-allocate + re-publish
    expect(buffer.capacity).toBeGreaterThanOrEqual(10);
    expect(republished).toBe(buffer.raw); // the new buffer reached the publisher
    expect(buffer.readId(0)).toBe(first); // survived the re-allocation copy
  });
});
