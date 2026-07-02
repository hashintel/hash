import { describe, expect, it } from "vitest";

import { entityIdFromComponents } from "@blockprotocol/type-system";

import {
  ENTITY_ID_BYTES,
  decodeEntityId,
  encodeEntityId,
} from "./entity-id-codec";

import type { DraftId, EntityUuid, WebId } from "@blockprotocol/type-system";

const webIdA = "11111111-1111-4111-8111-111111111111" as WebId;
const uuidA = "22222222-2222-4222-8222-222222222222" as EntityUuid;
const webIdB = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" as WebId;
const uuidB = "12345678-90ab-4cde-8f01-234567890abc" as EntityUuid;
const draftId = "33333333-3333-4333-8333-333333333333" as DraftId;

const recordBytes = (records: number) =>
  new Uint8Array(ENTITY_ID_BYTES * records);

describe("entity-id-codec", () => {
  it("round-trips a non-draft EntityId at an arbitrary index", () => {
    const bytes = recordBytes(4);
    const id = entityIdFromComponents(webIdA, uuidA);
    encodeEntityId(bytes, 2, id);
    expect(decodeEntityId(bytes, 2)).toBe(id);
  });

  it("preserves the draftId through a round-trip", () => {
    const bytes = recordBytes(4);
    const id = entityIdFromComponents(webIdA, uuidA, draftId);
    encodeEntityId(bytes, 0, id);
    expect(decodeEntityId(bytes, 0)).toBe(id);
  });

  it("keeps records independent by index", () => {
    const bytes = recordBytes(8);
    const first = entityIdFromComponents(webIdA, uuidA);
    const second = entityIdFromComponents(webIdB, uuidB, draftId);
    encodeEntityId(bytes, 0, first);
    encodeEntityId(bytes, 7, second);
    expect(decodeEntityId(bytes, 0)).toBe(first);
    expect(decodeEntityId(bytes, 7)).toBe(second);
  });

  it("zeroes the draftId slot when overwriting a draft with a non-draft id", () => {
    const bytes = recordBytes(2);
    encodeEntityId(bytes, 1, entityIdFromComponents(webIdA, uuidA, draftId));
    const plain = entityIdFromComponents(webIdB, uuidB);
    encodeEntityId(bytes, 1, plain);
    // if the stale draftId leaked, the decoded id would still carry it
    expect(decodeEntityId(bytes, 1)).toBe(plain);
  });
});
