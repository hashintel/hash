/**
 * SharedArrayBuffer-backed `EntityIdx -> EntityId` map. The worker writes;
 * the main thread reads via atomic version sync. Byte layout is defined
 * in {@link "../entity-id-codec"}.
 */
import {
  ENTITY_ID_BYTES,
  ID_HEADER_BYTES,
  decodeEntityId,
  encodeEntityId,
} from "../entity-id-codec";
import { GrowableBuffer, type RepublishHandler } from "./growable-buffer";

import type { EntityId } from "@blockprotocol/type-system";

/** Default growable ceiling (entities). Reserves address space, not committed memory. */
const ENTITY_ID_MAX_CAPACITY = 262_144;

export class EntityIdBuffer extends GrowableBuffer {
  #bytes!: Uint8Array;

  constructor(
    capacity: number,
    republish?: RepublishHandler,
    maxCapacity: number = ENTITY_ID_MAX_CAPACITY,
  ) {
    super(ID_HEADER_BYTES, ENTITY_ID_BYTES, capacity, maxCapacity, republish);
    this.bindRecordViews(this.raw);
  }

  protected override bindRecordViews(
    raw: SharedArrayBuffer | ArrayBuffer,
  ): void {
    this.#bytes = new Uint8Array(raw, ID_HEADER_BYTES);
  }

  /** Worker side: record the EntityId for an EntityIdx. */
  setId(entityIdx: number, entityId: EntityId): void {
    encodeEntityId(this.#bytes, entityIdx, entityId);
  }

  /** Reconstruct the EntityId for an EntityIdx. */
  readId(entityIdx: number): EntityId {
    return decodeEntityId(this.#bytes, entityIdx);
  }
}
