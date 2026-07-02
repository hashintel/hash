/**
 * SharedArrayBuffer-backed `EntityIdx -> EntityId` map. The worker writes;
 * the main thread reads. Each record is {@link ENTITY_ID_BYTES} bytes
 * (webId | entityUuid | draftId, 16 bytes each; an all-zero draftId slot
 * means the entity is not a draft), preceded by a 4-byte version header.
 * See {@link "../entity-id-codec"} for the exact byte-level codec.
 *
 * No-version contract: unlike the position buffers, reads here do not check
 * the version header. That is safe because a record is written the instant its
 * EntityIdx is interned -- strictly before any frame referencing that index is
 * published -- and once written it never changes. The main thread can only ask
 * about indices it learned from a published frame, so it never reads an
 * unwritten or torn record.
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

  /** Writes the EntityId for an EntityIdx into the shared buffer. Must complete before any frame referencing that index is published. */
  setId(entityIdx: number, entityId: EntityId): void {
    encodeEntityId(this.#bytes, entityIdx, entityId);
  }

  /** Reads the EntityId for an EntityIdx. Safe on any index present in a published frame (see no-version contract in file header). */
  readId(entityIdx: number): EntityId {
    return decodeEntityId(this.#bytes, entityIdx);
  }
}
