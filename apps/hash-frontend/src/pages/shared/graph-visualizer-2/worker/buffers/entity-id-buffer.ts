/**
 * SharedArrayBuffer-backed `EntityIdx -> EntityId` map: the join key that lets the
 * main thread turn a rendered record back into its entity (for labels, icons, tooltips,
 * picking) without shuffling per-entity data through the worker.
 *
 * The worker is the sole writer (it owns interning); the main thread is a reader. It is
 * synchronized by the same atomic version bump as the position buffers, with no message,
 * no library, no bidirectional sync. The byte layout lives in {@link "../entity-id-codec"}
 * so the main-thread reader shares one decoder; this class is just the growable store.
 */
import {
  ENTITY_ID_BYTES,
  ID_HEADER_BYTES,
  decodeEntityId,
  encodeEntityId,
} from "../entity-id-codec";
import { GrowableBuffer, type RepublishHandler } from "./growable-buffer";

import type { EntityId } from "@blockprotocol/type-system";

/** Default growable ceiling (entities): reserves address space, commits as it grows.
 * A re-publish only fires past this. */
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

  /** Reconstruct the EntityId for an EntityIdx (exercised by the round-trip tests; the
   * main thread decodes its received buffer with {@link decodeEntityId} directly). */
  readId(entityIdx: number): EntityId {
    return decodeEntityId(this.#bytes, entityIdx);
  }
}
